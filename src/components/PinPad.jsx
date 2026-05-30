// components/PinPad.jsx
import { useState } from "react";

export default function PinPad({ onComplete, accentColor = "#185FA5" }) {
    const [pin, setPin] = useState("");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

    const handleKey = (k) => {
        if (k === "⌫") {
            setPin(p => p.slice(0, -1));
        } else if (pin.length < 4) {
            const next = pin + k;
            setPin(next);
            if (next.length === 4) {
                setTimeout(() => { setPin(""); onComplete(next); }, 250);
            }
        }
    };

    return (
        <div className="pinpad">
            <div className="pin-dots">
                {[0, 1, 2, 3].map(i => (
                    <div
                        key={i}
                        className="pin-dot"
                        style={{
                            background: i < pin.length ? accentColor : "transparent",
                            borderColor: i < pin.length ? accentColor : "#ccc"
                        }}
                    />
                ))}
            </div>
            <div className="keypad-grid">
                {keys.map((k, i) => (
                    <div
                        key={i}
                        className={`key ${!k ? "key-empty" : ""}`}
                        onClick={() => k && handleKey(k)}
                    >
                        {k}
                    </div>
                ))}
            </div>
        </div>
    );
}
