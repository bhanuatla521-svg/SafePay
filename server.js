// server.js — SafePay Live API Server
const http = require("http");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "database", "safepay.db");
const PORT = 4000;

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

    const url = req.url;

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

    // ── POST /api/transaction ── add new transaction from frontend
    if (req.method === "POST" && url === "/api/transaction") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { studentId, merchantUpi, merchantName, amount, note, locationId } = JSON.parse(body);
                const db = getDb();

                // Insert transaction
                const txnResult = db.prepare(`
                    INSERT INTO transactions (student_id, merchant_upi, merchant_name, amount, note, status, location_id, scanned_qr)
                    VALUES (?, ?, ?, ?, ?, 'success', ?, 0)
                `).run(studentId || 1, merchantUpi, merchantName, amount, note, locationId || 1);

                const txnId = txnResult.lastInsertRowid;

                // Deduct from wallet
                db.prepare(`UPDATE wallets SET balance = balance - ? WHERE user_id = ?`).run(amount, studentId || 1);

                // Add parent notification
                db.prepare(`
                    INSERT INTO parent_notifications (parent_id, txn_id, message)
                    VALUES (2, ?, ?)
                `).run(txnId, `Arjun paid ₹${amount} to ${merchantName} (${note})`);

                // Get updated balance
                const wallet = db.prepare(`SELECT balance FROM wallets WHERE user_id = ?`).get(studentId || 1);
                db.close();

                return json(res, { success: true, txnId, newBalance: wallet.balance });
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

    // ── Serve HTML Viewer on root ──
    if (req.method === "GET" && url === "/") {
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

    // ── Default ──
    json(res, { message: "SafePay API running", endpoints: ["/api/all", "/api/table/:name", "/api/transaction", "/api/limits", "/api/limit-request", "/api/limit-request/respond"] });
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n🔒 SafePay API Server running at http://127.0.0.1:${PORT}`);
    console.log(`   GET  http://127.0.0.1:${PORT}/api/all`);
    console.log(`   GET  http://127.0.0.1:${PORT}/api/table/transactions`);
    console.log(`   POST http://127.0.0.1:${PORT}/api/transaction\n`);
});
