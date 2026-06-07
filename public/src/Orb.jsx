// Orb.jsx — the AI "core". Layered CSS sphere with orbital rings + state machine.
// states: "idle" | "listening" | "thinking" | "speaking"
function Orb({ state = "idle", size = 220, onClick }) {
  const cls = ["orb-stage", "orb-" + state].join(" ");
  return (
    <div className={cls} style={{ width: size, height: size, cursor: onClick ? "pointer" : "default" }} onClick={onClick}>
      {/* outer atmospheric glow */}
      <div className="orb-glow"></div>

      {/* expanding ripple (listening / speaking) */}
      <div className="orb-ripple"></div>
      <div className="orb-ripple orb-ripple-2"></div>

      {/* orbital rings */}
      <svg className="orb-rings" viewBox="0 0 200 200" aria-hidden="true">
        <ellipse className="ring ring-a" cx="100" cy="100" rx="92" ry="34" />
        <ellipse className="ring ring-b" cx="100" cy="100" rx="78" ry="88" />
        <ellipse className="ring ring-c" cx="100" cy="100" rx="50" ry="92" />
      </svg>

      {/* the sphere */}
      <div className="orb-body">
        <div className="orb-sheen"></div>
        <div className="orb-core"></div>
        <div className="orb-grain"></div>
      </div>

      {/* drifting micro-particles */}
      <div className="orb-particles">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} style={{ "--i": i, "--d": (3 + (i % 5) * 0.7) + "s", "--del": (i * 0.4) + "s" }}></span>
        ))}
      </div>
    </div>
  );
}
window.Orb = Orb;
