// components/QRScanner.jsx
import { useState, useEffect, useRef } from "react";

const MERCHANTS = [
    { upi: "canteen@upi", name: "College Canteen", amount: 80, category: "food" },
    { upi: "hostel@upi", name: "Hostel Office", amount: 500, category: "hostel" },
    { upi: "auto@upi", name: "Auto Driver", amount: 70, category: "transport" },
    { upi: "stationery@upi", name: "Campus Books", amount: 140, category: "stationery" },
];

export default function QRScanner({ onScanned, onClose }) {
    const [scanStatus, setScanStatus] = useState("Scanning...");
    const [scanned, setScanned] = useState(false);
    const barRef = useRef(null);

    // Animate scan line
    useEffect(() => {
        if (scanned) return;
        let pos = 0, dir = 1;
        const id = setInterval(() => {
            pos += dir * 2;
            if (pos >= 158) dir = -1;
            if (pos <= 0) dir = 1;
            if (barRef.current) barRef.current.style.top = pos + "px";
        }, 16);
        return () => clearInterval(id);
    }, [scanned]);

    const handleScan = (merchant) => {
        if (scanned) return;
        setScanned(true);
        setScanStatus("QR detected — " + merchant.name);
        setTimeout(() => onScanned(merchant), 700);
    };

    return (
        <div className="qr-screen">
            <div className="qr-topbar">
                <button className="back-btn" onClick={onClose}>← Back</button>
                <span>Scan QR code</span>
            </div>

            {/* Camera viewfinder */}
            <div className="viewfinder">
                <div className="vf-overlay" />
                <div className="vf-box">
                    <div className="scan-bar" ref={barRef} />
                    <div className="corner tl" /><div className="corner tr" />
                    <div className="corner bl" /><div className="corner br" />
                </div>
                <div className="vf-status-top">{scanStatus}</div>
                <div className="vf-hint">
                    {scanned ? "Processing..." : "Point camera at a QR code"}
                </div>
            </div>

            {/* Simulated merchant QRs */}
            <div className="qr-merchants">
                <p className="qr-merchant-label">Tap a merchant QR to simulate scan</p>
                <div className="merchant-grid">
                    {MERCHANTS.map((m) => (
                        <div key={m.upi} className="merchant-qr" onClick={() => handleScan(m)}>
                            <QRPattern seed={m.upi.length} />
                            <span>{m.name.split(" ")[0]}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Generates a simple deterministic QR-like pattern SVG
function QRPattern({ seed }) {
    const size = 44, cells = 11, cell = size / cells;
    const fixed = [
        [1, 1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0, 1], [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1], [1, 0, 1, 1, 1, 0, 1], [1, 0, 0, 0, 0, 0, 1], [1, 1, 1, 1, 1, 1, 1],
    ];
    const rand = (r, c) => ((r * 7 + c * 13 + seed * 3) % 17) > 8 ? 1 : 0;
    const rects = [];
    for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
            let on = false;
            if (r < 7 && c < 7) on = fixed[r][c] === 1;
            else on = rand(r, c) === 1;
            if (on) rects.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="currentColor" />);
        }
    }
    return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ color: "var(--color-text-primary)" }}>{rects}</svg>;
}
