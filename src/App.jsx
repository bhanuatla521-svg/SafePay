// App.jsx — SafePay Root Component
import { useState, useEffect } from "react";
import SplashScreen from "./pages/SplashScreen";
import StudentLogin from "./pages/StudentLogin";
import ParentLogin from "./pages/ParentLogin";
import StudentHome from "./pages/StudentHome";
import ParentHome from "./pages/ParentHome";
import { AppContext } from "./context/AppContext";

function formatTime(dateStr) {
    if (!dateStr) return "Today";
    try {
        const formattedStr = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
        const d = new Date(formattedStr);
        if (isNaN(d.getTime())) return dateStr;
        const now = new Date();
        const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.floor((nowDate - dDate) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        if (diffDays === 1) return "Yesterday";
        return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch (e) {
        return dateStr;
    }
}

export default function App() {
    const [screen, setScreen] = useState("splash");
    const [balance, setBalance] = useState(3200);
    const [spent, setSpent] = useState(1800);
    const [limits, setLimitsState] = useState({ monthly: 5000, daily: 1000, perTxn: 500 });
    const [transactions, setTransactions] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [limitRequests, setLimitRequests] = useState([]);

    // ── Fetch all data from SQLite DB ──────────────────────────
    const fetchDatabaseData = () => {
        fetch("/api/all")
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // 1. Wallet balance
                const wallet = (data.wallets || []).find(w => w.user_id === 1);
                if (wallet) setBalance(parseFloat(wallet.balance));

                // 2. Spending limits
                const limit = (data.spending_limits || []).find(l => l.student_id === 1);
                if (limit) {
                    setLimitsState({
                        monthly: parseFloat(limit.monthly_limit),
                        daily:   parseFloat(limit.daily_limit),
                        perTxn:  parseFloat(limit.per_txn_limit),
                    });
                }

                // 3. Transactions + GPS lookup map
                const gpsMap = {};
                (data.gps_locations || []).forEach(g => { gpsMap[g.location_id] = g.address; });

                const txns = (data.transactions || [])
                    .filter(t => t.student_id === 1)
                    .map(t => ({
                        id:       t.txn_id,
                        name:     t.merchant_name || t.merchant_upi.split("@")[0].replace(/\./g, " "),
                        upi:      t.merchant_upi,
                        note:     t.note,
                        amount:   parseFloat(t.amount),
                        time:     formatTime(t.created_at),
                        location: gpsMap[t.location_id] || "Unknown Location",
                    }))
                    .sort((a, b) => b.id - a.id);

                setTransactions(txns);

                // Compute monthly spent from DB
                const totalSpent = txns.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
                setSpent(totalSpent);

                // 4. Parent notifications
                const txnMap = {};
                txns.forEach(t => { txnMap[t.id] = t; });

                const notifs = (data.parent_notifications || [])
                    .filter(n => n.parent_id === 2)
                    .map(n => {
                        const txn = txnMap[n.txn_id] || {};
                        return {
                            id:       n.notif_id,
                            message:  n.message,
                            location: txn.location || "Unknown Location",
                            amount:   txn.amount || 0,
                            merchant: txn.name || "Unknown Merchant",
                            time:     formatTime(n.sent_at),
                            read:     Boolean(n.is_read),
                        };
                    })
                    .sort((a, b) => b.id - a.id);

                setNotifications(notifs);

                // 5. Limit increase requests
                const reqs = (data.limit_increase_requests || [])
                    .filter(r => r.student_id === 1)
                    .map(r => ({
                        id:         r.request_id,
                        studentId:  r.student_id,
                        parentId:   r.parent_id,
                        reason:     r.reason,
                        amount:     parseFloat(r.requested_amt),
                        status:     r.status,
                        created_at: formatTime(r.created_at),
                    }))
                    .sort((a, b) => b.id - a.id);

                setLimitRequests(reqs);
            })
            .catch(err => console.error("DB sync error:", err));
    };

    // Load on mount
    useEffect(() => { fetchDatabaseData(); }, []);

    // ── Add transaction (student pays) ─────────────────────────
    const addTransaction = (txn) => {
        // Optimistic UI update
        setTransactions(prev => [txn, ...prev]);
        setBalance(prev => prev - txn.amount);
        setSpent(prev => prev + txn.amount);
        setNotifications(prev => [{
            id:       Date.now(),
            message:  `Arjun paid ₹${txn.amount} to ${txn.name} (${txn.note}) at ${txn.location}`,
            location: txn.location,
            amount:   txn.amount,
            merchant: txn.name,
            time:     txn.time,
            read:     false,
        }, ...prev]);

        // Persist to DB (API inserts real GPS log automatically)
        fetch("/api/transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                studentId:    1,
                merchantUpi:  txn.upi,
                merchantName: txn.name,
                amount:       txn.amount,
                note:         txn.note,
            }),
        })
        .then(() => fetchDatabaseData())
        .catch(() => {});
    };

    // ── Request budget increase (student) ───────────────────────
    const requestLimitIncrease = (amount, reason) => {
        const tempId = Date.now();
        setLimitRequests(prev => [{
            id: tempId, studentId: 1, parentId: 2,
            reason, amount: parseFloat(amount), status: "pending", created_at: "Just now"
        }, ...prev]);

        return fetch("/api/limit-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ studentId: 1, parentId: 2, reason, amount: parseFloat(amount) }),
        })
        .then(() => { fetchDatabaseData(); return true; })
        .catch(() => false);
    };

    // ── Respond to limit request (parent) ──────────────────────
    const respondLimitRequest = (requestId, status, newLimit) => {
        setLimitRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));
        if (status === "approved" && newLimit) {
            setLimitsState(prev => ({ ...prev, monthly: newLimit }));
        }

        fetch("/api/limit-request/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId, status, newLimit }),
        })
        .then(() => fetchDatabaseData())
        .catch(() => {});
    };

    // ── Update spending limits (parent settings) ────────────────
    const updateParentLimits = (newLimits) => {
        setLimitsState(newLimits);
        fetch("/api/limits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ monthly: newLimits.monthly, daily: newLimits.daily, perTxn: newLimits.perTxn }),
        })
        .then(() => fetchDatabaseData())
        .catch(() => {});
    };

    // ── Feature 5: Wallet top-up (parent adds money) ────────────
    const topupWallet = (amount) => {
        return fetch("/api/wallet/topup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                setBalance(data.newBalance);  // instant UI update
                fetchDatabaseData();           // full re-sync
                return true;
            }
            return false;
        })
        .catch(() => false);
    };

    return (
        <AppContext.Provider value={{
            screen, setScreen,
            balance, spent,
            limits, setLimits: updateParentLimits,
            transactions, addTransaction,
            notifications,
            limitRequests, requestLimitIncrease, respondLimitRequest,
            topupWallet,
            refreshData: fetchDatabaseData,
        }}>
            {screen === "splash"       && <SplashScreen />}
            {screen === "studentLogin" && <StudentLogin />}
            {screen === "parentLogin"  && <ParentLogin />}
            {screen === "studentHome"  && <StudentHome />}
            {screen === "parentHome"   && <ParentHome />}
        </AppContext.Provider>
    );
}
