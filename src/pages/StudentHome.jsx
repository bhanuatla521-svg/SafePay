// pages/StudentHome.jsx
import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import PinPad from "../components/PinPad";
import QRScanner from "../components/QRScanner";

const CATEGORY_META = {
    food:        { emoji: "🍱", label: "Food" },
    transport:   { emoji: "🛺", label: "Transport" },
    stationery:  { emoji: "📚", label: "Books" },
    hostel:      { emoji: "🏠", label: "Hostel" },
    other:       { emoji: "💸", label: "Other" },
};

export default function StudentHome() {
    const { setScreen, balance, spent, limits, transactions, addTransaction, limitRequests, requestLimitIncrease } = useApp();
    const [tab, setTab] = useState("home");  // home | history | profile
    const [subScreen, setSubScreen] = useState(null); // pay | qr | pin | success
    const [payForm, setPayForm] = useState({ to: "", amount: "", note: "" });
    const [pending, setPending] = useState(null);
    const [lastTxn, setLastTxn] = useState(null);
    const [qrScanned, setQrScanned] = useState(false);

    // Limit Increase Request modal states
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitForm, setLimitForm] = useState({ amount: "", reason: "" });

    // Spending stats for History tab
    const [spendingStats, setSpendingStats] = useState([]);

    // Load spending category breakdown when History tab opens
    useEffect(() => {
        if (tab === "history") {
            fetch("/api/spending-stats?studentId=1")
                .then(r => r.json())
                .then(data => { if (Array.isArray(data)) setSpendingStats(data); })
                .catch(() => {});
        }
    }, [tab]);

    const pct = Math.min(Math.round((spent / limits.monthly) * 100), 100);

    const openPay = (note, upi, amount) => {
        setPayForm({ to: upi, amount: String(amount || ""), note });
        setQrScanned(false);
        setSubScreen("pay");
    };

    const handleQRScanned = (merchant) => {
        setPayForm({ to: merchant.upi, amount: String(merchant.amount), note: merchant.name });
        setQrScanned(true);
        setSubScreen("pay");
    };

    // Feature 1 & 2: Enforce daily + monthly limits before allowing PIN entry
    const goPIN = async () => {
        const amt = parseFloat(payForm.amount);
        if (!payForm.to || !amt || amt < 1) return alert("Please fill all fields");
        if (amt > balance) return alert("Insufficient balance!");
        if (amt > limits.perTxn) return alert(`Per-transaction limit is ₹${limits.perTxn}`);

        // Feature 2: Monthly limit block
        if ((spent + amt) > limits.monthly) {
            return alert(`Monthly budget exceeded! You cannot make this payment.\nMonthly limit: ₹${limits.monthly} | Used: ₹${spent.toFixed(2)} | Remaining: ₹${(limits.monthly - spent).toFixed(2)}`);
        }

        // Feature 1: Daily limit enforcement (real DB check)
        try {
            const res = await fetch("/api/daily-spent?studentId=1");
            const { spent_today, daily_limit, remaining } = await res.json();
            if ((spent_today + amt) > daily_limit) {
                return alert(`Daily limit reached! ₹${remaining.toFixed(2)} remaining today.\nDaily limit: ₹${daily_limit} | Used today: ₹${spent_today.toFixed(2)}`);
            }
        } catch {
            // If API is offline, skip daily check and allow payment
        }

        setPending({ ...payForm, amount: amt });
        setSubScreen("pin");
    };

    const doPayment = () => {
        const LOCATIONS = [
            "CBIT College, Hyderabad", "Kothapet, Hyderabad",
            "Dilsukhnagar, Hyderabad", "LB Nagar, Hyderabad", "Uppal, Hyderabad",
        ];
        const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
        const now = new Date();
        const time = "Today " + now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
        const txn = {
            id: Date.now(),
            name: pending.to.split("@")[0].replace(/\./g, " "),
            upi: pending.to,
            note: pending.note,
            amount: pending.amount,
            time,
            location: loc,
        };
        addTransaction(txn);
        setLastTxn(txn);
        setSubScreen("success");
    };

    // ── Sub-screens ──────────────────────────────────────────
    if (subScreen === "qr") {
        return <QRScanner onScanned={handleQRScanned} onClose={() => setSubScreen(null)} />;
    }

    if (subScreen === "pay") return (
        <div className="student-screen">
            <div className="topbar blue">
                <button className="back-btn" onClick={() => setSubScreen(null)}>← Back</button>
                <span>Send money</span>
            </div>
            <div className="pay-body">
                {qrScanned && (
                    <div className="qr-badge">
                        <span className="qr-icon">▣</span>
                        <div>
                            <div className="qr-badge-title">QR scanned</div>
                            <div className="qr-badge-sub">{payForm.to}</div>
                        </div>
                    </div>
                )}
                <label>Paying to (UPI ID)</label>
                <input value={payForm.to} onChange={e => setPayForm(f => ({ ...f, to: e.target.value }))} placeholder="e.g. friend@upi" />
                <label>Amount (₹)</label>
                <input value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="Enter amount" type="number" />
                <label>Note</label>
                <input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="What's it for?" />
                <div className="gps-notice">
                    <strong>GPS alert to parent</strong>
                    <span>Your location + payment details sent to Mom automatically.</span>
                </div>
                {/* Show live limits before user submits */}
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '10px' }}>
                    Daily remaining: ₹{(limits.daily - 0).toFixed(0)} cap · Monthly: ₹{(limits.monthly - spent).toFixed(0)} left · Per-txn cap: ₹{limits.perTxn}
                </div>
                <button className="btn-primary full" onClick={goPIN}>Continue to PIN</button>
            </div>
        </div>
    );

    if (subScreen === "pin") return (
        <div className="student-screen">
            <div className="topbar blue">
                <button className="back-btn" onClick={() => setSubScreen("pay")}>← Back</button>
                <span>Enter UPI PIN</span>
            </div>
            <div className="pin-screen">
                <div className="lock-icon">🔒</div>
                <div className="pin-title">Paying ₹{pending?.amount} · {pending?.note || pending?.to}</div>
                <div className="pin-sub">Enter your 4-digit UPI PIN</div>
                <PinPad onComplete={doPayment} accentColor="#185FA5" />
            </div>
        </div>
    );

    if (subScreen === "success") return (
        <div className="student-screen">
            <div className="success-screen">
                <div className="success-check">✓</div>
                <h2>Payment sent!</h2>
                <div className="success-amt">₹{lastTxn?.amount}</div>
                <div className="success-to">Sent to {lastTxn?.upi}</div>
                <div className="parent-notif-preview">
                    <div className="pnp-title">Parent notified with GPS</div>
                    <div className="pnp-body">
                        Mom got: "Arjun paid ₹{lastTxn?.amount} to {lastTxn?.name} — {lastTxn?.location}"
                    </div>
                </div>
                <button className="btn-primary full" onClick={() => { setSubScreen(null); setTab("home"); }}>Done</button>
            </div>
        </div>
    );

    // ── Main tabs ─────────────────────────────────────────────
    return (
        <div className="student-screen">
            <div className="topbar blue">
                <div>
                    <div className="topbar-sub">Good morning</div>
                    <div className="topbar-name">Arjun Kumar</div>
                </div>
            </div>

            <div className="student-body">
                {tab === "home" && (
                    <>
                        <div className="balance-card">
                            <div className="bal-label">Available balance</div>
                            <div className="bal-amount">₹{balance.toLocaleString("en-IN")}</div>
                            <div className="bal-upi">arjun.kumar@safepay</div>
                        </div>
                        <div className="limit-section">
                            <div className="limit-bar"><div className="limit-fill" style={{ width: pct + "%" }} /></div>
                            <div className="limit-text">
                                <span>Monthly: ₹{spent.toLocaleString("en-IN")} of ₹{limits.monthly.toLocaleString("en-IN")} used</span>
                            </div>

                            {limitRequests.length > 0 && (
                                <div className="limit-req-info">
                                    {limitRequests[0].status === "pending" ? (
                                        <>
                                            <span className="limit-req-badge">Request Pending</span>
                                            <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#b45309' }}>₹{limitRequests[0].amount} request is awaiting approval</span>
                                        </>
                                    ) : limitRequests[0].status === "approved" ? (
                                        <>
                                            <span className="limit-req-badge" style={{ background: '#ecfdf5', color: '#059669' }}>Approved</span>
                                            <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#059669' }}>+₹{limitRequests[0].amount} added to monthly limit!</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="limit-req-badge" style={{ background: '#fef2f2', color: '#ef4444' }}>Denied</span>
                                            <span style={{ fontSize: '10.5px', fontWeight: '600', color: '#ef4444' }}>Request for ₹{limitRequests[0].amount} denied by Mom</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="section-title">Pay</div>
                        <div className="quick-grid">
                            {[["🍱", "Canteen", "Canteen", "canteen@upi", 80],
                            ["🛺", "Auto", "Auto fare", "auto@upi", 60],
                            ["📚", "Books", "Books", "stationery@upi", 120],
                            ["↗", "Send", "Send money", "friend@upi", 0]
                            ].map(([icon, label, note, upi, amt]) => (
                                <div key={label} className="quick-btn" onClick={() => openPay(note, upi, amt)}>
                                    <span className="quick-icon">{icon}</span>{label}
                                </div>
                            ))}
                        </div>

                        <div className="section-title">Recent</div>
                        {transactions.slice(0, 3).map(t => (
                            <div key={t.id} className="txn-row">
                                <div className="txn-left">
                                    <div className="txn-avatar">{t.name.slice(0, 2).toUpperCase()}</div>
                                    <div>
                                        <div className="txn-name">{t.name}</div>
                                        <div className="txn-note">{t.note} · {t.time}</div>
                                    </div>
                                </div>
                                <div className="txn-amt">-₹{t.amount}</div>
                            </div>
                        ))}
                    </>
                )}

                {tab === "history" && (
                    <>
                        {/* Feature 4: Spending category pills */}
                        {spendingStats.length > 0 && (
                            <div style={{ padding: '10px 12px 4px' }}>
                                <div className="section-title" style={{ margin: '0 0 6px' }}>Spending by category</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                    {spendingStats.map(s => {
                                        const meta = CATEGORY_META[s.category] || CATEGORY_META.other;
                                        return (
                                            <div key={s.category} style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                background: '#EAF3DE', border: '0.5px solid #C0DD97',
                                                borderRadius: '20px', padding: '4px 10px', fontSize: '11px',
                                                color: '#27500A', fontWeight: '500'
                                            }}>
                                                <span>{meta.emoji}</span>
                                                <span>{meta.label}</span>
                                                <span style={{ color: '#3B6D11', fontWeight: '600' }}>₹{s.total_spent.toFixed(0)}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Mini horizontal bar */}
                                {(() => {
                                    const total = spendingStats.reduce((s, r) => s + r.total_spent, 0);
                                    const colors = ['#185FA5','#3B6D11','#854F0B','#A32D2D','#555'];
                                    return total > 0 ? (
                                        <div style={{ height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex', marginBottom: '12px' }}>
                                            {spendingStats.map((s, i) => (
                                                <div key={s.category} style={{
                                                    width: `${(s.total_spent / total * 100).toFixed(1)}%`,
                                                    background: colors[i % colors.length],
                                                    transition: 'width 0.4s'
                                                }} title={`${s.category}: ₹${s.total_spent}`} />
                                            ))}
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                        )}

                        <div className="section-title">All transactions</div>
                        {transactions.length === 0
                            ? <div className="empty-state">No transactions yet.</div>
                            : transactions.map(t => (
                                <div key={t.id} className="txn-row">
                                    <div className="txn-left">
                                        <div className="txn-avatar">{t.name.slice(0, 2).toUpperCase()}</div>
                                        <div>
                                            <div className="txn-name">{t.name}</div>
                                            <div className="txn-note">{t.note} · {t.time}</div>
                                            <div className="txn-loc">📍 {t.location}</div>
                                        </div>
                                    </div>
                                    <div className="txn-amt">-₹{t.amount}</div>
                                </div>
                            ))
                        }
                    </>
                )}

                {tab === "profile" && (
                    <>
                        <div className="profile-card">
                            <div className="profile-title">Account details</div>
                            <div className="profile-row"><span>UPI</span><span>arjun.kumar@safepay</span></div>
                            <div className="profile-row"><span>Phone</span><span>+91 98765 43210</span></div>
                            <div className="profile-row"><span>College</span><span>CBIT, Hyderabad</span></div>
                            <div className="profile-row"><span>Monthly limit</span><span>₹{limits.monthly.toLocaleString("en-IN")}</span></div>
                            <div className="profile-row"><span>Daily limit</span><span>₹{limits.daily.toLocaleString("en-IN")}</span></div>
                            <div className="profile-row"><span>Per-txn cap</span><span>₹{limits.perTxn.toLocaleString("en-IN")}</span></div>
                        </div>

                        <div style={{ padding: '0 16px', marginBottom: '8px' }}>
                            <button className="btn-primary full" onClick={() => setShowLimitModal(true)}>
                                📝 Request Limit Increase
                            </button>
                        </div>

                        {limitRequests.length > 0 && (
                            <div className="profile-card">
                                <div className="profile-title" style={{ marginBottom: '10px' }}>Budget Requests</div>
                                <div style={{ maxHeight: '140px', overflowY: 'auto' }}>
                                    {limitRequests.map(r => (
                                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '8px 0', borderBottom: '1px solid #f8fafc' }}>
                                            <div>
                                                <div style={{ fontWeight: '700', color: '#1e293b' }}>₹{r.amount}</div>
                                                <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>{r.reason}</div>
                                            </div>
                                            <span className={r.status === 'approved' ? 'limit-req-badge-approved' : r.status === 'denied' ? 'limit-req-badge-denied' : 'limit-req-badge-pending'}>
                                                {r.status.toUpperCase()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="gps-notice">
                            <strong>GPS monitoring active</strong>
                            <span>Every payment sends your live GPS + transaction details to your parent instantly.</span>
                        </div>
                        <button className="btn-outline full" style={{ margin: '0 16px', width: 'calc(100% - 32px)' }} onClick={() => setScreen("splash")}>Logout</button>
                    </>
                )}
            </div>

            <div className="navbar">
                <div className={`nav-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}>
                    <span style={{ fontSize: '16px' }}>🏠</span>
                    Home
                </div>
                <div className="nav-item nav-qr" onClick={() => setSubScreen("qr")}>
                    <div className="qr-nav-btn">▣</div>
                    Scan QR
                </div>
                <div className={`nav-item ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
                    <span style={{ fontSize: '16px' }}>🕒</span>
                    History
                </div>
                <div className={`nav-item ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")}>
                    <span style={{ fontSize: '16px' }}>👤</span>
                    Profile
                </div>
            </div>

            {showLimitModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <button className="modal-close" onClick={() => setShowLimitModal(false)}>×</button>
                        <h3 className="modal-title">Request Limit Increase</h3>
                        <label>Amount to add (₹)</label>
                        <input
                            type="number"
                            placeholder="e.g. 1500"
                            value={limitForm.amount}
                            onChange={e => setLimitForm(f => ({ ...f, amount: e.target.value }))}
                        />
                        <label>Reason for request</label>
                        <input
                            type="text"
                            placeholder="e.g. Need to buy college project kit"
                            value={limitForm.reason}
                            onChange={e => setLimitForm(f => ({ ...f, reason: e.target.value }))}
                        />
                        <button
                            className="btn-primary full"
                            onClick={() => {
                                const amt = parseFloat(limitForm.amount);
                                if (!amt || amt <= 0 || !limitForm.reason) {
                                    alert("Please fill all fields with valid data!");
                                    return;
                                }
                                requestLimitIncrease(amt, limitForm.reason).then(success => {
                                    if (success) {
                                        setShowLimitModal(false);
                                        setLimitForm({ amount: "", reason: "" });
                                        alert("Limit increase request sent to Mom successfully!");
                                    } else {
                                        alert("Failed to send request.");
                                    }
                                });
                            }}
                        >
                            Submit Request
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
