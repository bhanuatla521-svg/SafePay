// pages/ParentLogin.jsx
import { useState } from "react";
import { useApp } from "../context/AppContext";
import PinPad from "../components/PinPad";

export default function ParentLogin() {
    const { setScreen } = useApp();
    const [error, setError] = useState("");
    const [key, setKey] = useState(0); // remount PinPad to clear dots on error

    const handlePin = (pin) => {
        // Feature 7: Verify PIN against DB
        fetch("/api/verify-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: 2, pin }),
        })
        .then(r => r.json())
        .then(({ valid }) => {
            if (valid) {
                setError("");
                setScreen("parentHome");
            } else {
                setError("Incorrect PIN. Try again.");
                setKey(k => k + 1); // reset PinPad dots
            }
        })
        .catch(() => {
            // If API is offline, fall back to demo PIN check
            if (pin === "5678") {
                setScreen("parentHome");
            } else {
                setError("Incorrect PIN. Try again.");
                setKey(k => k + 1);
            }
        });
    };

    return (
        <div className="login-screen">
            <div className="topbar green">
                <button className="back-btn" onClick={() => setScreen("splash")}>← Back</button>
                <span>Parent login</span>
            </div>
            <div className="login-body">
                <div className="login-avatar green-avatar">MK</div>
                <div className="login-name">Meena Kumar</div>
                <div className="login-sub">+91 98765 00001</div>
                <div className="login-label">Enter PIN</div>
                {error && (
                    <div style={{
                        background: '#FDEDED', color: '#A32D2D', borderRadius: '8px',
                        padding: '6px 12px', fontSize: '11px', marginBottom: '10px',
                        border: '0.5px solid #f5c6c6', width: '100%', textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}
                <PinPad key={key} onComplete={handlePin} accentColor="#3B6D11" />
                <div style={{ fontSize: '10px', color: '#bbb', marginTop: '12px' }}>
                    Demo PIN: 5678
                </div>
            </div>
        </div>
    );
}
