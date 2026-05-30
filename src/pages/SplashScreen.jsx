// pages/SplashScreen.jsx
import { useApp } from "../context/AppContext";

export default function SplashScreen() {
    const { setScreen } = useApp();
    return (
        <div className="splash">
            <div className="splash-logo">S</div>
            <h1 className="splash-title">SafePay</h1>
            <p className="splash-sub">Smart UPI for students</p>
            <div className="splash-btns">
                <button className="btn-primary" onClick={() => setScreen("studentLogin")}>
                    Login as Student
                </button>
                <button className="btn-secondary" onClick={() => setScreen("parentLogin")}>
                    Login as Parent
                </button>
            </div>
            <p className="splash-note">
                Parents receive live GPS location<br />and alerts on every transaction
            </p>
        </div>
    );
}
