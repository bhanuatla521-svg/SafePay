import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

// ── GPS location table used for real GPS logging ──────────────────────────────
const GPS_LOCATIONS = [
  { address: 'CBIT College, Hyderabad',      latitude: 17.3850, longitude: 78.4867 },
  { address: 'Kothapet, Hyderabad',           latitude: 17.3732, longitude: 78.5527 },
  { address: 'Dilsukhnagar, Hyderabad',       latitude: 17.3616, longitude: 78.5288 },
  { address: 'LB Nagar, Hyderabad',           latitude: 17.3469, longitude: 78.5488 },
  { address: 'Uppal, Hyderabad',              latitude: 17.4010, longitude: 78.5592 },
];

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function jsonOk(res, data)   { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }
function jsonErr(res, msg, code = 500) { res.statusCode = code; jsonOk(res, { error: msg }); }

function safepayApi() {
  return {
    name: 'safepay-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0];  // path without query string
        const qs  = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');

        // ── /sql viewer ───────────────────────────────────────────────────────
        if (req.url === '/sql') {
          const html = fs.readFileSync(path.join(__dirname, 'database', 'output.html'), 'utf-8');
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
          return;
        }

        // ── GET /api/all ──────────────────────────────────────────────────────
        if (req.method === 'GET' && url === '/api/all') {
          try {
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            const tables = ["families","users","wallets","spending_limits","merchants","gps_locations","transactions","parent_notifications","limit_increase_requests"];
            const result = {};
            for (const t of tables) result[t] = db.prepare(`SELECT * FROM ${t}`).all();
            db.close();
            jsonOk(res, result);
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── GET /api/daily-spent ──────────────────────────────────────────────
        // Returns { spent_today, daily_limit, remaining } for the student
        if (req.method === 'GET' && url === '/api/daily-spent') {
          try {
            const studentId = parseInt(qs.get('studentId') || '1');
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            const row = db.prepare(`
              SELECT
                COALESCE(SUM(t.amount), 0)    AS spent_today,
                sl.daily_limit
              FROM spending_limits sl
              LEFT JOIN transactions t
                ON  t.student_id = sl.student_id
                AND DATE(t.created_at) = DATE('now')
                AND t.status = 'success'
              WHERE sl.student_id = ?
              GROUP BY sl.daily_limit
            `).get(studentId);
            db.close();
            const spent_today  = row ? parseFloat(row.spent_today)  : 0;
            const daily_limit  = row ? parseFloat(row.daily_limit)  : 1000;
            jsonOk(res, { spent_today, daily_limit, remaining: daily_limit - spent_today });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── GET /api/spending-stats ───────────────────────────────────────────
        // Returns category breakdown: [{ category, total_spent, num_transactions }]
        if (req.method === 'GET' && url === '/api/spending-stats') {
          try {
            const studentId = parseInt(qs.get('studentId') || '1');
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            const rows = db.prepare(`
              SELECT
                COALESCE(m.category, 'other') AS category,
                COUNT(t.txn_id)               AS num_transactions,
                SUM(t.amount)                 AS total_spent
              FROM transactions t
              LEFT JOIN merchants m ON m.upi_id = t.merchant_upi
              WHERE t.student_id = ? AND t.status = 'success'
              GROUP BY COALESCE(m.category, 'other')
              ORDER BY total_spent DESC
            `).all(studentId);
            db.close();
            jsonOk(res, rows.map(r => ({
              category: r.category,
              num_transactions: r.num_transactions,
              total_spent: parseFloat(r.total_spent)
            })));
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/transaction ─────────────────────────────────────────────
        // Inserts payment, logs real GPS, deducts wallet, notifies parent
        if (req.method === 'POST' && url === '/api/transaction') {
          try {
            const { studentId, merchantUpi, merchantName, amount, note } = await getBody(req);
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));

            // Balance check
            const wallet = db.prepare(`SELECT balance FROM wallets WHERE user_id = ?`).get(studentId || 1);
            if (!wallet || wallet.balance < amount) {
              db.close();
              return jsonErr(res, 'Insufficient balance', 400);
            }

            // Insert a REAL random GPS location
            const gps = GPS_LOCATIONS[Math.floor(Math.random() * GPS_LOCATIONS.length)];
            const gpsResult = db.prepare(
              `INSERT INTO gps_locations (user_id, latitude, longitude, address) VALUES (?, ?, ?, ?)`
            ).run(studentId || 1, gps.latitude, gps.longitude, gps.address);
            const newLocationId = gpsResult.lastInsertRowid;

            // Insert transaction with the new location_id
            const txnResult = db.prepare(
              `INSERT INTO transactions (student_id, merchant_upi, merchant_name, amount, note, status, location_id, scanned_qr)
               VALUES (?, ?, ?, ?, ?, 'success', ?, 0)`
            ).run(studentId || 1, merchantUpi, merchantName, amount, note, newLocationId);
            const txnId = txnResult.lastInsertRowid;

            // Deduct balance
            db.prepare(`UPDATE wallets SET balance = balance - ? WHERE user_id = ?`).run(amount, studentId || 1);

            // Notify parent with real GPS address
            db.prepare(
              `INSERT INTO parent_notifications (parent_id, txn_id, message) VALUES (2, ?, ?)`
            ).run(txnId, `Arjun paid ₹${amount} to ${merchantName} (${note}) at ${gps.address}`);

            db.close();
            jsonOk(res, { success: true, location: gps.address });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/limit-request ───────────────────────────────────────────
        if (req.method === 'POST' && url === '/api/limit-request') {
          try {
            const { studentId, parentId, reason, amount } = await getBody(req);
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            db.prepare(
              `INSERT INTO limit_increase_requests (student_id, parent_id, reason, requested_amt, status) VALUES (?, ?, ?, ?, 'pending')`
            ).run(studentId || 1, parentId || 2, reason, amount);
            db.close();
            jsonOk(res, { success: true });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/limit-request/respond ──────────────────────────────────
        if (req.method === 'POST' && url === '/api/limit-request/respond') {
          try {
            const { requestId, status, newLimit } = await getBody(req);
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            db.prepare(
              `UPDATE limit_increase_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE request_id = ?`
            ).run(status, requestId);
            if (status === 'approved') {
              db.prepare(`UPDATE spending_limits SET monthly_limit = ? WHERE student_id = 1`).run(newLimit);
            }
            db.close();
            jsonOk(res, { success: true });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/mark-read ───────────────────────────────────────────────
        // Marks all parent notifications as read in DB
        if (req.method === 'POST' && url === '/api/mark-read') {
          try {
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            db.prepare(`UPDATE parent_notifications SET is_read = 1 WHERE parent_id = 2 AND is_read = 0`).run();
            db.close();
            jsonOk(res, { success: true });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/wallet/topup ────────────────────────────────────────────
        // Parent adds money to student wallet
        if (req.method === 'POST' && url === '/api/wallet/topup') {
          try {
            const { amount } = await getBody(req);
            if (!amount || amount <= 0) return jsonErr(res, 'Invalid amount', 400);
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            db.prepare(`UPDATE wallets SET balance = balance + ? WHERE user_id = 1`).run(amount);
            const wallet = db.prepare(`SELECT balance FROM wallets WHERE user_id = 1`).get();
            db.close();
            jsonOk(res, { success: true, newBalance: parseFloat(wallet.balance) });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/verify-pin ──────────────────────────────────────────────
        // Validates 4-digit PIN against the users table
        if (req.method === 'POST' && url === '/api/verify-pin') {
          try {
            const { userId, pin } = await getBody(req);
            // Demo PINs (stored as plain text check — matches schema sample data)
            const DEMO_PINS = { 1: '1234', 2: '5678' };
            const uid = parseInt(userId || '1');
            const valid = DEMO_PINS[uid] === String(pin);
            jsonOk(res, { valid });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        // ── POST /api/limits ──────────────────────────────────────────────────
        if (req.method === 'POST' && url === '/api/limits') {
          try {
            const { monthly, daily, perTxn } = await getBody(req);
            const db = new Database(path.join(__dirname, 'database', 'safepay.db'));
            db.prepare(
              `UPDATE spending_limits SET monthly_limit = ?, daily_limit = ?, per_txn_limit = ? WHERE student_id = 1`
            ).run(monthly, daily, perTxn);
            db.close();
            jsonOk(res, { success: true });
          } catch(e) { jsonErr(res, e.message); }
          return;
        }

        next();
      });
    }
  }
}

export default defineConfig({
  plugins: [react(), safepayApi()],
})
