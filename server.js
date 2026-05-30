// server.js — SafePay Live API Server
const http = require("http");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "database", "safepay.db");
const PORT = 4000;

const GPS_LOCATIONS = [
  { address: 'CBIT College, Hyderabad',      latitude: 17.3850, longitude: 78.4867 },
  { address: 'Kothapet, Hyderabad',           latitude: 17.3732, longitude: 78.5527 },
  { address: 'Dilsukhnagar, Hyderabad',       latitude: 17.3616, longitude: 78.5288 },
  { address: 'LB Nagar, Hyderabad',           latitude: 17.3469, longitude: 78.5488 },
  { address: 'Uppal, Hyderabad',              latitude: 17.4010, longitude: 78.5592 },
];

function getDb() {
    return new Database(DB_PATH);
}

function json(res, data, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        });
        return res.end();
    }

    const url = req.url.split('?')[0];
    const qs = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');

    // ── GET /api/all ── return all tables
    if (req.method === "GET" && url === "/api/all") {
        try {
            const db = getDb();
            const tables = ["families","users","wallets","spending_limits","merchants","gps_locations","transactions","parent_notifications","limit_increase_requests"];
            const result = {};
            for (const t of tables) {
                result[t] = db.prepare(`SELECT * FROM ${t}`).all();
            }
            db.close();
            return json(res, result);
        } catch (e) {
            return json(res, { error: e.message }, 500);
        }
    }

    // ── GET /api/table/:name ── return single table
    if (req.method === "GET" && url.startsWith("/api/table/")) {
        const table = url.replace("/api/table/", "");
        try {
            const db = getDb();
            const rows = db.prepare(`SELECT * FROM ${table}`).all();
            db.close();
            return json(res, rows);
        } catch (e) {
            return json(res, { error: e.message }, 500);
        }
    }

    // ── GET /api/daily-spent ── spent today summary
    if (req.method === "GET" && url === "/api/daily-spent") {
        try {
            const studentId = parseInt(qs.get("studentId") || "1");
            const db = getDb();
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
            return json(res, { spent_today, daily_limit, remaining: daily_limit - spent_today });
        } catch (e) {
            return json(res, { error: e.message }, 500);
        }
    }

    // ── GET /api/spending-stats ── breakdown of spending
    if (req.method === "GET" && url === "/api/spending-stats") {
        try {
            const studentId = parseInt(qs.get("studentId") || "1");
            const db = getDb();
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
            return json(res, rows.map(r => ({
              category: r.category,
              num_transactions: r.num_transactions,
              total_spent: parseFloat(r.total_spent)
            })));
        } catch (e) {
            return json(res, { error: e.message }, 500);
        }
    }

    // ── POST /api/transaction ── insert payment, GPS, wallet deduction, parent notification
    if (req.method === "POST" && url === "/api/transaction") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { studentId, merchantUpi, merchantName, amount, note } = JSON.parse(body);
                const db = getDb();

                // Balance check
                const wallet = db.prepare(`SELECT balance FROM wallets WHERE user_id = ?`).get(studentId || 1);
                if (!wallet || wallet.balance < amount) {
                    db.close();
                    return json(res, { error: "Insufficient balance" }, 400);
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
                return json(res, { success: true, location: gps.address });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── POST /api/limits ── update spending limits
    if (req.method === "POST" && url === "/api/limits") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { monthly, daily, perTxn } = JSON.parse(body);
                const db = getDb();
                db.prepare(`UPDATE spending_limits SET monthly_limit=?, daily_limit=?, per_txn_limit=? WHERE student_id=1`).run(monthly, daily, perTxn);
                db.close();
                return json(res, { success: true });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── POST /api/limit-request ── create limit request
    if (req.method === "POST" && url === "/api/limit-request") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { studentId, parentId, reason, amount } = JSON.parse(body);
                const db = getDb();
                db.prepare(`INSERT INTO limit_increase_requests (student_id, parent_id, reason, requested_amt, status) VALUES (?, ?, ?, ?, 'pending')`).run(studentId || 1, parentId || 2, reason, amount);
                db.close();
                return json(res, { success: true });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── POST /api/limit-request/respond ── approve/deny limit request
    if (req.method === "POST" && url === "/api/limit-request/respond") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { requestId, status, newLimit } = JSON.parse(body);
                const db = getDb();
                db.prepare(`UPDATE limit_increase_requests SET status = ?, responded_at = CURRENT_TIMESTAMP WHERE request_id = ?`).run(status, requestId);
                if (status === 'approved') {
                    db.prepare(`UPDATE spending_limits SET monthly_limit = ? WHERE student_id = 1`).run(newLimit);
                }
                db.close();
                return json(res, { success: true });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── POST /api/mark-read ── mark parent notifications as read
    if (req.method === "POST" && url === "/api/mark-read") {
        try {
            const db = getDb();
            db.prepare(`UPDATE parent_notifications SET is_read = 1 WHERE parent_id = 2 AND is_read = 0`).run();
            db.close();
            return json(res, { success: true });
        } catch (e) {
            return json(res, { error: e.message }, 500);
        }
    }

    // ── POST /api/wallet/topup ── add money to student wallet
    if (req.method === "POST" && url === "/api/wallet/topup") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { amount } = JSON.parse(body);
                if (!amount || amount <= 0) {
                    return json(res, { error: "Invalid amount" }, 400);
                }
                const db = getDb();
                db.prepare(`UPDATE wallets SET balance = balance + ? WHERE user_id = 1`).run(amount);
                const wallet = db.prepare(`SELECT balance FROM wallets WHERE user_id = 1`).get();
                db.close();
                return json(res, { success: true, newBalance: parseFloat(wallet.balance) });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── POST /api/verify-pin ── verify student/parent login PIN
    if (req.method === "POST" && url === "/api/verify-pin") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { userId, pin } = JSON.parse(body);
                // Demo PINs (matches sample data in database users table)
                const DEMO_PINS = { 1: "1234", 2: "5678" };
                const uid = parseInt(userId || "1");
                const valid = DEMO_PINS[uid] === String(pin);
                return json(res, { valid });
            } catch (e) {
                return json(res, { error: e.message }, 500);
            }
        });
        return;
    }

    // ── Serve HTML Viewer on /sql ──
    if (req.method === "GET" && url === "/sql") {
        try {
            const htmlPath = path.join(__dirname, "database", "output.html");
            const htmlContent = fs.readFileSync(htmlPath, "utf8");
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(htmlContent);
            return;
        } catch (e) {
            return json(res, { error: "Failed to load output.html" }, 500);
        }
    }

    // ── Serve static files from dist/ for frontend ──
    if (req.method === "GET") {
        let filePath = path.join(__dirname, "dist", url === "/" ? "index.html" : url);

        // Prevent directory traversal
        if (!filePath.startsWith(path.join(__dirname, "dist"))) {
            res.writeHead(403, { "Content-Type": "text/plain" });
            return res.end("Forbidden");
        }

        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                // SPA fallback - serve index.html for unknown routes
                filePath = path.join(__dirname, "dist", "index.html");
            }

            const ext = path.extname(filePath).toLowerCase();
            let contentType = "text/html";
            if (ext === ".css") contentType = "text/css";
            else if (ext === ".js") contentType = "application/javascript";
            else if (ext === ".png") contentType = "image/png";
            else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
            else if (ext === ".svg") contentType = "image/svg+xml";
            else if (ext === ".ico") contentType = "image/x-icon";
            else if (ext === ".json") contentType = "application/json";

            fs.readFile(filePath, (error, content) => {
                if (error) {
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Server Error");
                } else {
                    res.writeHead(200, { "Content-Type": contentType });
                    res.end(content);
                }
            });
        });
        return;
    }

    // ── Default ──
    json(res, { error: "Not Found" }, 404);
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n🔒 SafePay API Server running at http://127.0.0.1:${PORT}`);
    console.log(`   GET  http://127.0.0.1:${PORT}/api/all`);
    console.log(`   GET  http://127.0.0.1:${PORT}/api/table/transactions`);
    console.log(`   POST http://127.0.0.1:${PORT}/api/transaction\n`);
});
