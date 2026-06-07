// Settings.jsx — model selection tab. Lists curated presets per role
// (language / embedding / vision) with size + device badges, applies the
// choice via /api/settings; the server swaps models in the background.
function fmtGB(bytes) {
  return bytes ? (bytes / 1e9).toFixed(1) + " GB" : "";
}

const ROLE_META = {
  llm:    { title: "LANGUAGE MODEL",  sub: "Classifies what you save and answers your questions." },
  embed:  { title: "EMBEDDING MODEL", sub: "Powers semantic search. Switching re-indexes every note in the background." },
  vision: { title: "VISION MODEL",    sub: "Describes images so they become searchable. Loads only when needed." },
};

function ModelRow({ p, active, busy, switching, pct, onPick }) {
  return (
    <button className={"model-row" + (active ? " active" : "")} disabled={busy} onClick={onPick}>
      <span className="model-radio">{active && <span className="model-radio-dot"></span>}</span>
      <span className="model-main">
        <span className="model-name">
          {p.label}
          {p.best.includes("pi") && <span className="model-badge pi">PI ★</span>}
          {p.best.includes("m2") && <span className="model-badge m2">M2 ★</span>}
        </span>
        <span className="model-desc">{p.desc}</span>
      </span>
      <span className="model-size mono">
        {active && switching ? <span className="model-dl">↓ {pct}%</span> : fmtGB(p.sizeBytes)}
      </span>
    </button>
  );
}

function SettingsView({ vault }) {
  const { useState, useEffect } = React;
  const [cfg, setCfg] = useState(null);
  const [busyRole, setBusyRole] = useState(null);
  const [pendingRole, setPendingRole] = useState(null); // role currently downloading

  useEffect(() => { API.settings().then(setCfg).catch(() => {}); }, []);

  const switching = vault.state === "loading";
  useEffect(() => { if (!switching) setPendingRole(null); }, [switching]);

  const pick = async (role, key) => {
    if (!cfg || busyRole || cfg.current[role] === key) return;
    setBusyRole(role);
    setPendingRole(role);
    setCfg((c) => ({ ...c, current: { ...c.current, [role]: key } }));
    try {
      await API.saveSettings({ [role]: key });
    } catch (e) {
      API.settings().then(setCfg).catch(() => {}); // revert to server truth
    }
    setBusyRole(null);
  };

  return (
    <div className="settings-view">
      <header className="gal-head">
        <div className="gal-title">
          <span className="gt-icon"><Icon name="settings" size={20}/></span>
          <div>
            <h2>Settings</h2>
            <div className="gt-count">MODEL CORES</div>
          </div>
        </div>
      </header>

      {switching && (
        <div className="settings-progress">
          <div className="settings-progress-track">
            <div className="settings-progress-bar" style={{ width: (vault.pct || 0) + "%" }}></div>
          </div>
          <span className="settings-progress-msg mono">{vault.msg || vault.txt}</span>
        </div>
      )}

      {!cfg
        ? <div className="settings-loading mono">LOADING…</div>
        : <div className="settings-body">
            <p className="settings-hint">
              <span className="model-badge pi">PI ★</span> best on Raspberry Pi&nbsp;&nbsp;
              <span className="model-badge m2">M2 ★</span> best on Apple Silicon.
              New models download once (size shown) and swap in the background — the app stays usable.
            </p>
            {Object.keys(ROLE_META).map((role) => (
              <section key={role} className="settings-section">
                <div className="recent-h">{ROLE_META[role].title}</div>
                <div className="settings-sub">{ROLE_META[role].sub}</div>
                <div className="model-list">
                  {cfg.presets[role].map((p) => (
                    <ModelRow key={p.key} p={p}
                      active={cfg.current[role] === p.key}
                      busy={busyRole !== null || switching}
                      switching={switching && pendingRole === role}
                      pct={vault.pct || 0}
                      onPick={() => pick(role, p.key)} />
                  ))}
                </div>
              </section>
            ))}
          </div>}
    </div>
  );
}

Object.assign(window, { SettingsView });
