// pages/ParentHome.jsx
import { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";

export default function ParentHome() {
    const { setScreen, balance, spent, limits, setLimits, notifications, transactions, limitRequests, respondLimitRequest, topupWallet, refreshData } = useApp();
    const [tab, setTab] = useState("home");
    const [saved, setSaved] = useState(false);
    const [formLimits, setFormLimits] = useState({ ...limits });

    // Feature 5: Wallet top-up state
    const [topupAmount, setTopupAmount] = useState("");
    const [topupMsg, setTopupMsg] = useState("");

    // Live transaction notification toast state
    const [toastNotif, setToastNotif] = useState(null);

    // Sync form state when limits change globally
    useEffect(() => {
        setFormLimits({ ...limits });
    }, [limits]);

    // Feature 3: Mark notifications as read in DB when Home tab is visible
    useEffect(() => {
        if (tab === "home") {
            const unread = notifications.some(n => !n.read);
            if (unread) {
                fetch("/api/mark-read", { method: "POST" })
                    .then(() => refreshData())
                    .catch(() => {});
            }
        }
    }, [tab]);

    // Detect new unread notifications and pop up toast
    useEffect(() => {
        const unread = notifications.find(n => !n.read);
        if (unread) {
            setToastNotif(unread);
            const timer = setTimeout(() => setToastNotif(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [notifications]);

    const saveLimits = () => {
        setLimits(formLimits);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    // Feature 5: Handle wallet top-up
    const handleTopup = () => {
        const amt = parseFloat(topupAmount);
        if (!amt || amt <= 0) return setTopupMsg("Please enter a valid amount.");
        topupWallet(amt).then(success => {
            if (success) {
                setTopupMsg(`✓ ₹${amt} added to Arjun's wallet!`);
                setTopupAmount("");
                setTimeout(() => setTopupMsg(""), 4000);
            } else {
                setTopupMsg("Failed to add money. Try again.");
            }
        });
    };

    // Feature 3: Unread notification count for badge
    const unreadCount = notifications.filter(n => !n.read).length;

    const lastLoc = notifications.length > 0 ? notifications[0].location : "CBIT College, Hyderabad";
    const pendingRequests = limitRequests.filter(r => r.status === "pending");

    return (
        <div className="parent-screen">
            {/* Live Notification Toast Alert */}
            {toastNotif && (
                <div className="toast-alert">
                    <span className="toast-icon">🔔</span>
                    <div className="toast-message">
                        <strong>Live Alert: Arjun paid ₹{toastNotif.amount}</strong> to {toastNotif.merchant} at {toastNotif.location}
                    </div>
                    <button className="toast-close" onClick={() => setToastNotif(null)}>✕</button>
                </div>
            )}

            <div className="topbar green">
                <div>
                    <div className="topbar-sub">Parent dashboard</div>
                    <div className="topbar-name">Meena Kumar</div>
                </div>
            </div>

            <div className="parent-body">
                {tab === "home" && (
                    <>
                        <div className="student-status-card">
                            <div className="student-info">
                                <div className="student-avatar">AK</div>
                                <div>
                                    <div className="student-name">Arjun Kumar</div>
                                    <div className="student-loc">Last seen: {lastLoc}</div>
                                </div>
                                <span className="badge-active">Active</span>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-box">
                                    <div className="stat-label">Wallet Balance</div>
                                    <div className="stat-val">₹{balance.toLocaleString("en-IN")}</div>
                                </div>
                                <div className="stat-box">
                                    <div className="stat-label">Spent this month</div>
                                    <div className="stat-val">₹{spent.toLocaleString("en-IN")}</div>
                                </div>
                            </div>
                        </div>

                        {/* Pending Limit Increase Requests section */}
                        {pendingRequests.length > 0 && (
                            <>
                                <div className="section-title">Limit Increase Requests</div>
                                {pendingRequests.map(req => (
                                    <div key={req.id} className="limit-req-card">
                                        <div className="limit-req-header">
                                            <span className="limit-req-amount">₹{req.amount.toLocaleString("en-IN")}</span>
                                            <span className="limit-req-badge-pending">PENDING</span>
                                        </div>
                                        <p className="limit-req-reason">
                                            "{req.reason}"
                                        </p>
                                        <div className="limit-req-actions">
                                            <button
                                                className="limit-req-btn-approve"
                                                onClick={() => {
                                                    const newLimit = limits.monthly + req.amount;
                                                    respondLimitRequest(req.id, "approved", newLimit);
                                                }}
                                            >
                                                Approve (+₹{req.amount})
                                            </button>
                                            <button
                                                className="limit-req-btn-deny"
                                                onClick={() => respondLimitRequest(req.id, "denied", null)}
                                            >
                                                Deny
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}

                        <div className="section-title">Recent Alerts</div>
                        {notifications.length === 0
                            ? <div className="empty-state">No alerts yet.</div>
                            : notifications.slice(0, 5).map(n => (
                                <div key={n.id} className="alert-row">
                                    <div>
                                        <div className="alert-title">{n.message}</div>
                                        <div className="alert-time">{n.time}</div>
                                        <div className="loc-pill">📍 {n.location}</div>
                                    </div>
                                    <span className={n.read ? "badge-seen" : "limit-req-badge-pending"}>
                                        {n.read ? "Read" : "New"}
                                    </span>
                                </div>
                            ))
                        }
                    </>
                )}

                {tab === "map" && (
                    <>
                        <div className="section-title">Live GPS — Arjun</div>
                        <div className="map-container">
                            <GPSMap notifications={notifications} />
                        </div>
                        <div className="section-title" style={{ marginTop: "16px" }}>Location history</div>
                        {notifications.length === 0
                            ? <div className="empty-state">No location logs available.</div>
                            : notifications.slice(0, 5).map((n, i) => (
                                <div key={i} className="loc-history-row">📍 {n.location} · {n.time}</div>
                            ))
                        }
                    </>
                )}

                {tab === "settings" && (
                    <>
                        {/* Feature 5: Wallet Top-Up section */}
                        <div className="settings-card">
                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#111', marginBottom: '10px' }}>
                                💰 Add Money to Arjun's Wallet
                            </div>
                            <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
                                Current balance: <strong style={{ color: '#185FA5' }}>₹{balance.toLocaleString("en-IN")}</strong>
                            </div>
                            <label>Amount to add (₹)</label>
                            <input
                                type="number"
                                placeholder="e.g. 500"
                                value={topupAmount}
                                onChange={e => setTopupAmount(e.target.value)}
                            />
                            <button className="btn-primary full" onClick={handleTopup}>
                                Add ₹{topupAmount || "0"} to Wallet
                            </button>
                            {topupMsg && (
                                <div style={{
                                    marginTop: '8px', fontSize: '11px', padding: '6px 10px',
                                    borderRadius: '8px',
                                    background: topupMsg.startsWith("✓") ? '#EAF3DE' : '#FDEDED',
                                    color: topupMsg.startsWith("✓") ? '#27500A' : '#A32D2D'
                                }}>
                                    {topupMsg}
                                </div>
                            )}
                        </div>

                        {/* Spending Limits */}
                        <div className="settings-card">
                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#111', marginBottom: '10px' }}>
                                ⚙️ Spending Limits
                            </div>
                            <label>Monthly Limit (₹)</label>
                            <input type="number" value={formLimits.monthly}
                                onChange={e => setFormLimits(f => ({ ...f, monthly: +e.target.value }))} />
                            <label>Daily Limit (₹)</label>
                            <input type="number" value={formLimits.daily}
                                onChange={e => setFormLimits(f => ({ ...f, daily: +e.target.value }))} />
                            <label>Per-transaction cap (₹)</label>
                            <input type="number" value={formLimits.perTxn}
                                onChange={e => setFormLimits(f => ({ ...f, perTxn: +e.target.value }))} />
                            <button className="btn-green full" onClick={saveLimits}>Save limits</button>
                            {saved && <div className="save-msg">Limits saved and synced!</div>}
                        </div>

                        <button className="btn-outline full" style={{ margin: '0 16px', width: 'calc(100% - 32px)' }} onClick={() => setScreen("splash")}>Logout</button>
                    </>
                )}
            </div>

            {/* Feature 3: Unread badge on Home tab */}
            <div className="navbar green-nav">
                <div className={`nav-item ${tab === "home" ? "active" : ""}`} onClick={() => setTab("home")}
                    style={{ position: 'relative' }}>
                    <span style={{ fontSize: '16px' }}>🏠</span>
                    {unreadCount > 0 && tab !== "home" && (
                        <span style={{
                            position: 'absolute', top: '4px', right: '12px',
                            background: '#A32D2D', color: 'white',
                            borderRadius: '50%', width: '15px', height: '15px',
                            fontSize: '9px', fontWeight: '600',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                    )}
                    Home
                </div>
                <div className={`nav-item ${tab === "map" ? "active" : ""}`} onClick={() => setTab("map")}>
                    <span style={{ fontSize: '16px' }}>📍</span>
                    GPS map
                </div>
                <div className={`nav-item ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
                    <span style={{ fontSize: '16px' }}>⚙️</span>
                    Settings
                </div>
            </div>
        </div>
    );
}

// SVG GPS Map component
function GPSMap({ notifications }) {
    const locs = [
        { name: "CBIT College", x: 138, y: 120 },
        { name: "Kothapet", x: 68, y: 68 },
        { name: "Dilsukhnagar", x: 220, y: 88 },
        { name: "LB Nagar", x: 248, y: 185 },
        { name: "Uppal", x: 42, y: 188 },
    ];

    const points = notifications.slice(0, 5).map(n => {
        const match = locs.find(l => n.location.includes(l.name)) || locs[0];
        return match;
    });

    const current = points.length > 0 ? points[0] : locs[0];

    return (
        <svg width="100%" height="240" viewBox="0 0 276 240" xmlns="http://www.w3.org/2000/svg">
            <rect width="276" height="240" fill="#f1f5f9" />
            <line x1="0" y1="40" x2="276" y2="40" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="0" y1="80" x2="276" y2="80" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="0" y1="120" x2="276" y2="120" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="0" y1="160" x2="276" y2="160" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="0" y1="200" x2="276" y2="200" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="46" y1="0" x2="46" y2="240" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="92" y1="0" x2="92" y2="240" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="138" y1="0" x2="138" y2="240" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="184" y1="0" x2="184" y2="240" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="230" y1="0" x2="230" y2="240" stroke="#cbd5e1" strokeWidth="0.5" />
            <rect x="0" y="108" width="276" height="12" fill="#cbd5e1" opacity="0.75" />
            <rect x="0" y="140" width="276" height="8" fill="#cbd5e1" opacity="0.6" />
            <rect x="170" y="0" width="12" height="240" fill="#cbd5e1" opacity="0.75" />
            <rect x="230" y="0" width="8" height="240" fill="#cbd5e1" opacity="0.6" />
            <text x="138" y="104" fontSize="8" fontWeight="700" fill="#94a3b8" textAnchor="middle">HYDERABAD METRO EXPRESSWAY</text>
            {points.slice(1).map((p, i) => (
                <line key={i} x1={points[i].x} y1={points[i].y} x2={p.x} y2={p.y}
                    stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="4,4" opacity="0.8" />
            ))}
            {points.slice(1).map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="5" fill="#93c5fd" stroke="#2563eb" strokeWidth="1.5" />
            ))}
            <circle cx={current.x} cy={current.y} r="16" fill="#3b82f6" opacity="0.2">
                <animate attributeName="r" values="8;20;8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={current.x} cy={current.y} r="8" fill="#3b82f6" stroke="white" strokeWidth="1.5" />
            <circle cx={current.x} cy={current.y} r="3.5" fill="white" />
            <g transform={`translate(${Math.min(Math.max(current.x - 50, 6), 164)}, ${current.y > 150 ? current.y - 48 : current.y + 16})`}>
                <rect width="100" height="34" rx="8" fill="#1e293b" opacity="0.95" />
                <text x="50" y="15" fontSize="9" fontWeight="700" fill="white" textAnchor="middle">
                    {current.name}
                </text>
                <text x="50" y="26" fontSize="7.5" fontWeight="600" fill="#10b981" textAnchor="middle">
                    ● Arjun's Location
                </text>
            </g>
        </svg>
    );
}
