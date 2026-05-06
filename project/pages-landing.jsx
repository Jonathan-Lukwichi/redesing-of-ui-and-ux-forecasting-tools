/* HealthForecast AI — Landing Page (marketing) */

const PageLanding = () => {
  return (
    <div style={{ background: "#fafbfc", minHeight: "100%", color: "#0f172a", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Top nav */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        padding: "20px 56px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        color: "white",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #2f86c4, #0d9488)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 14, color: "white",
          }}>HF</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>HealthForecast AI</div>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 13, fontWeight: 500 }}>
          <a style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Platform</a>
          <a style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Models</a>
          <a style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Outcomes</a>
          <a style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Customers</a>
          <a style={{ color: "rgba(255,255,255,0.85)", textDecoration: "none" }}>Pricing</a>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={{ background: "transparent", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Sign in</button>
          <button style={{ background: "white", color: "#0f1729", border: "none", padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Book a demo →</button>
        </div>
      </div>

      {/* HERO */}
      <div style={{
        position: "relative",
        minHeight: 720,
        background: `linear-gradient(115deg, rgba(15,23,41,0.92) 0%, rgba(30,58,95,0.85) 50%, rgba(13,148,136,0.55) 100%), url(images/hero-bg1.jpg)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        color: "white",
        padding: "140px 56px 80px",
        overflow: "hidden",
      }}>
        {/* Grid lines decoration */}
        <svg style={{ position: "absolute", right: 0, top: 0, opacity: 0.08, pointerEvents: "none" }} width="700" height="700" viewBox="0 0 700 700">
          {Array.from({ length: 28 }).map((_, i) => (
            <line key={"h" + i} x1="0" x2="700" y1={i * 25} y2={i * 25} stroke="white" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 28 }).map((_, i) => (
            <line key={"v" + i} y1="0" y2="700" x1={i * 25} x2={i * 25} stroke="white" strokeWidth="0.5" />
          ))}
        </svg>

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 48, alignItems: "center", maxWidth: 1320, margin: "0 auto", position: "relative" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", background: "rgba(125,211,252,0.15)", border: "1px solid rgba(125,211,252,0.35)", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#7dd3fc", letterSpacing: 0.4, marginBottom: 28 }}>
              <span style={{ width: 6, height: 6, background: "#7dd3fc", borderRadius: "50%" }} />
              NEW · LightGBM v3.2 · 96% forecast accuracy · 14 departments
            </div>
            <h1 style={{ fontSize: 64, fontWeight: 600, lineHeight: 1.05, letterSpacing: "-1.5px", margin: "0 0 24px 0" }}>
              Forecast demand.<br/>
              <span style={{ background: "linear-gradient(90deg, #7dd3fc, #5eead4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Across every department.
              </span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.6, color: "#cbd5e1", maxWidth: 540, margin: "0 0 36px 0" }}>
              End-to-end ML forecasting for the whole hospital — Emergency, ICU, Surgery, Maternity, Oncology, Radiology, Pharmacy and more. Turn raw EHR, weather, and calendar data into optimized weekly schedules and supply orders — in minutes, not weeks.
            </p>
            <div style={{ display: "flex", gap: 12, marginBottom: 40 }}>
              <button style={{ padding: "14px 28px", background: "white", color: "#0f1729", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}>
                Start free trial
              </button>
              <button style={{ padding: "14px 28px", background: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", backdropFilter: "blur(8px)" }}>
                Watch 2-min demo  ▸
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, auto)", gap: 40, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
              {[
                ["14", "Departments supported"],
                ["96%", "Forecast accuracy"],
                ["23%", "Overtime reduction"],
                ["7-day", "Forward horizon"],
              ].map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.8px" }}>{v}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero product mockup */}
          <div style={{ position: "relative" }}>
            <div style={{
              background: "white",
              borderRadius: 12,
              padding: 18,
              boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)",
              transform: "perspective(1600px) rotateY(-6deg) rotateX(2deg)",
              color: "#0f172a",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fc6058" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fdbc40" }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#34c749" }} />
                <div style={{ flex: 1, height: 22, background: "#f0f2f5", borderRadius: 4, marginLeft: 8, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 10, color: "#94a3b8" }}>app.healthforecast.ai/dashboard</div>
              </div>
              <div style={{ background: "#fafbfc", borderRadius: 6, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Today's forecast · all departments</div>
                    <div style={{ fontSize: 28, fontWeight: 600, marginTop: 2, letterSpacing: "-0.5px" }}>1,284 <span style={{ fontSize: 13, color: "#64748b", fontWeight: 400 }}>patients</span></div>
                  </div>
                  <div style={{ padding: "4px 10px", background: "#dcfce7", color: "#166534", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>+6.1% vs avg</div>
                </div>
                {/* Mini chart */}
                <svg viewBox="0 0 320 100" width="100%" height="100">
                  <defs>
                    <linearGradient id="lg-grad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#0d9488" stopOpacity="0.3" />
                      <stop offset="1" stopColor="#0d9488" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64 L 320 100 L 0 100 Z" fill="url(#lg-grad)" />
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48" stroke="#475569" strokeWidth="2" fill="none" />
                  <path d="M160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64" stroke="#0d9488" strokeWidth="2" fill="none" />
                  <line x1="160" y1="0" x2="160" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                  <text x="164" y="14" fontSize="9" fill="#64748b">Forecast →</text>
                </svg>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 12 }}>
                  {[188, 195, 218, 232, 215, 188, 174].map((v, i) => {
                    const isPeak = i === 3;
                    const lvl = isPeak ? "peak" : v > 200 ? "high" : "ok";
                    return (
                      <div key={i} style={{
                        padding: 6, borderRadius: 4, textAlign: "center",
                        background: isPeak ? "#fef5f5" : "white",
                        border: "1px solid " + (isPeak ? "#fecaca" : "#eef0f3"),
                      }}>
                        <div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase" }}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: isPeak ? "#dc2626" : "#0f172a", margin: "1px 0" }}>{v}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Department breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 8 }}>
                {[
                  ["ED", 232, "#dc2626"],
                  ["ICU", 48, "#1e6091"],
                  ["Surgery", 86, "#0d9488"],
                  ["Maternity", 41, "#7c3aed"],
                ].map(([d, n, c]) => (
                  <div key={d} style={{ padding: 5, borderRadius: 4, background: "white", border: "1px solid #eef0f3" }}>
                    <div style={{ fontSize: 8, color: c, textTransform: "uppercase", fontWeight: 600 }}>{d}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{n}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, padding: "8px 10px", background: "#f0f5fa", borderRadius: 4, fontSize: 11 }}>
                  <span style={{ color: "#1e6091", fontWeight: 600 }}>↗ Action:</span> Add 2 RNs to ED Thu PM · open 1 OR Fri
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div style={{ maxWidth: 1320, margin: "80px auto 0", paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 18 }}>Trusted by leading hospitals</div>
          <div style={{ display: "flex", gap: 56, alignItems: "center", opacity: 0.7, fontSize: 16, fontWeight: 600, color: "#cbd5e1", flexWrap: "wrap" }}>
            <span>MEMORIAL GENERAL</span>
            <span>· STEVE BIKO ACADEMIC</span>
            <span>· HOSPITAL DE MADRID</span>
            <span>· KAISER PERMANENTE</span>
            <span>· NHS LOTHIAN</span>
            <span>· GENEVA UNIVERSITY</span>
          </div>
        </div>
      </div>

      {/* PROBLEM / VALUE STRIP */}
      <div style={{ padding: "80px 56px", background: "white" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#1e6091", textTransform: "uppercase", marginBottom: 12 }}>The problem</div>
            <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.8px", margin: 0, lineHeight: 1.15, maxWidth: 880, marginInline: "auto" }}>
              Every department forecasts in its own spreadsheet. Nobody sees the full picture.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {[
              { v: "$8.6M", l: "Avg. annual hospital-wide overtime cost from misaligned staffing", c: "#dc2626" },
              { v: "31%", l: "Of departments report weekly stockouts of critical supplies", c: "#d97706" },
              { v: "47 min", l: "Added wait time on under-forecasted peak days across the hospital", c: "#dc2626" },
            ].map((s) => (
              <div key={s.l} style={{ padding: 32, background: "#fafbfc", borderRadius: 12, borderLeft: `3px solid ${s.c}` }}>
                <div style={{ fontSize: 44, fontWeight: 600, color: s.c, letterSpacing: "-1px", lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 14, color: "#475569", marginTop: 12, lineHeight: 1.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PIPELINE — HOW IT WORKS */}
      <div style={{ padding: "100px 56px", background: "linear-gradient(180deg, #fafbfc 0%, #f0f5fa 100%)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#1e6091", textTransform: "uppercase", marginBottom: 12 }}>How it works</div>
            <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.8px", margin: "0 0 16px 0" }}>One pipeline. Every department. Every morning.</h2>
            <p style={{ fontSize: 16, color: "#475569", maxWidth: 720, margin: "0 auto", lineHeight: 1.6 }}>A 5-stage pipeline runs nightly for ED, ICU, Surgery, Maternity, Oncology, Radiology and beyond — fully automated, with full audit trail and clinical override at every step.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, position: "relative" }}>
            {/* connector line */}
            <div style={{ position: "absolute", top: 32, left: "10%", right: "10%", height: 2, background: "linear-gradient(90deg, #1e6091, #0d9488)", opacity: 0.25 }} />
            {[
              { n: 1, t: "Ingest", d: "Pull EHR, weather & calendar via FHIR / S3 / SQL", icon: "upload", c: "#1e6091" },
              { n: 2, t: "Engineer", d: "74 features per department: lags, rolling stats, holidays, weather", icon: "table", c: "#1e6091" },
              { n: 3, t: "Train", d: "Per-department models: LightGBM, LSTM, SARIMAX, hybrids", icon: "cpu", c: "#0d9488" },
              { n: 4, t: "Forecast", d: "7-day demand for every unit with 95% prediction intervals", icon: "forecast", c: "#0d9488" },
              { n: 5, t: "Act", d: "Hospital-wide staff schedule + supply order recommendations", icon: "bolt", c: "#0d9488" },
            ].map((s) => (
              <div key={s.n} style={{ position: "relative", textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16,
                  background: "white",
                  border: `2px solid ${s.c}`,
                  margin: "0 auto 16px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: s.c,
                  boxShadow: "0 4px 16px rgba(30,96,145,0.12)",
                  position: "relative",
                  zIndex: 2,
                }}>
                  <Icon name={s.icon} size={26} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.c, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Step {s.n}</div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CAPABILITY GRID */}
      <div style={{ padding: "100px 56px", background: "white" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48, gap: 48 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#1e6091", textTransform: "uppercase", marginBottom: 12 }}>Platform</div>
              <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.8px", margin: 0, lineHeight: 1.15 }}>Everything operations needs.<br/>Nothing it doesn't.</h2>
            </div>
            <p style={{ fontSize: 15, color: "#475569", maxWidth: 380, lineHeight: 1.6, margin: 0 }}>13 integrated modules covering every clinical and ancillary department — from data ingestion to real-time recommendations on the floor.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, auto)", gap: 16 }}>
            {/* Big card 1 */}
            <div style={{
              gridColumn: "1 / 3",
              background: `linear-gradient(135deg, rgba(15,23,41,0.85) 0%, rgba(30,96,145,0.7) 100%), url(images/forecast-bg.jpg)`,
              backgroundSize: "cover", backgroundPosition: "center",
              borderRadius: 16, padding: 36, color: "white", minHeight: 280,
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#7dd3fc", textTransform: "uppercase", marginBottom: 12 }}>Headline feature</div>
                <h3 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 12px 0", letterSpacing: "-0.4px" }}>Multi-department forecasts with 95% prediction intervals</h3>
                <p style={{ fontSize: 14, color: "#cbd5e1", margin: 0, maxWidth: 560, lineHeight: 1.6 }}>Daily and hourly forecasts up to 7 days ahead — per department, per acuity, per service line. Diebold-Mariano tests confirm statistical significance vs. baselines.</p>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
                <div><div style={{ fontSize: 22, fontWeight: 600 }}>6.4%</div><div style={{ fontSize: 11, color: "#94a3b8" }}>MAPE</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 600 }}>94.2%</div><div style={{ fontSize: 11, color: "#94a3b8" }}>PI coverage</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 600 }}>7</div><div style={{ fontSize: 11, color: "#94a3b8" }}>Models compared</div></div>
              </div>
            </div>

            {/* Card */}
            <div style={{ background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 16, padding: 28, minHeight: 280 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#e8f1f8", color: "#1e6091", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon name="users" size={22}/>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px 0" }}>Staff Planner</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>Optimal RN, MD, and tech rosters across every unit — balancing demand, overtime caps, float-pool moves, certifications, and PTO.</p>
              <div style={{ marginTop: 18, padding: "8px 12px", background: "#dcfce7", color: "#166534", borderRadius: 6, fontSize: 12, fontWeight: 600, display: "inline-block" }}>−23% overtime</div>
            </div>

            {/* Card */}
            <div style={{ background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 16, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fdf3e3", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon name="box" size={22}/>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px 0" }}>Supply Planner</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>Reorder points and projected stockouts driven by demand forecasts across 1,400+ SKUs — pharmacy, OR, ICU, lab, radiology.</p>
            </div>

            {/* Card */}
            <div style={{ background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 16, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f0eafe", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon name="cpu" size={22}/>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px 0" }}>Model lab</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>Train, tune, and compare LightGBM · XGBoost · ARIMA · SARIMAX · ANN · LSTM · hybrids.</p>
            </div>

            {/* Card */}
            <div style={{ background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 16, padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fbeaea", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <Icon name="bolt" size={22}/>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px 0" }}>Action Center</h3>
              <p style={{ fontSize: 13, color: "#64748b", margin: 0, lineHeight: 1.6 }}>Prioritized hospital-wide recommendations with quantified $ impact and one-click approval workflow.</p>
            </div>
          </div>
        </div>
      </div>

      {/* MODEL ZOO */}
      <div style={{ padding: "100px 56px", background: "linear-gradient(180deg, #0f1729 0%, #1e3a5f 100%)", color: "white" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 64, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#7dd3fc", textTransform: "uppercase", marginBottom: 12 }}>Under the hood</div>
              <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.8px", margin: "0 0 20px 0", lineHeight: 1.15 }}>Seven models. One champion. Always your call.</h2>
              <p style={{ fontSize: 16, color: "#cbd5e1", lineHeight: 1.6, margin: "0 0 28px 0" }}>
                We train classical, ML, and deep-learning models in parallel — then promote the one that wins on YOUR data, with full statistical evidence (Diebold-Mariano, skill scores, residual diagnostics).
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["SHAP explainability", "LIME explainability", "Ljung-Box", "Shapiro-Wilk", "Breusch-Pagan", "Time-series CV"].map((c) => (
                  <span key={c} style={{ padding: "6px 12px", background: "rgba(125,211,252,0.1)", border: "1px solid rgba(125,211,252,0.25)", borderRadius: 999, fontSize: 12, color: "#7dd3fc" }}>{c}</span>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Live leaderboard · last training run</div>
              {[
                ["LightGBM v3.2", 6.4, true],
                ["Stacked ensemble", 6.7, false],
                ["XGBoost", 7.1, false],
                ["LSTM", 7.4, false],
                ["ANN", 7.8, false],
                ["SARIMAX", 9.2, false],
                ["ARIMA", 11.4, false],
              ].map(([n, v, best]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ width: 130, fontSize: 13, color: best ? "white" : "#cbd5e1", fontWeight: best ? 600 : 400 }}>
                    {n} {best && <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", background: "#0d9488", color: "white", borderRadius: 3 }}>WINNER</span>}
                  </div>
                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(15 - v) / 9 * 100}%`, background: best ? "linear-gradient(90deg, #7dd3fc, #5eead4)" : "rgba(125,211,252,0.4)" }} />
                  </div>
                  <div style={{ width: 50, fontSize: 13, fontFamily: "JetBrains Mono, monospace", textAlign: "right", color: best ? "#5eead4" : "#94a3b8" }}>{v}%</div>
                </div>
              ))}
              <div style={{ marginTop: 14, fontSize: 11, color: "#64748b" }}>Lower MAPE is better · evaluated on holdout test set</div>
            </div>
          </div>
        </div>
      </div>

      {/* OUTCOMES */}
      <div style={{ padding: "100px 56px", background: "white" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: "#1e6091", textTransform: "uppercase", marginBottom: 12 }}>Measured outcomes</div>
            <h2 style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.8px", margin: 0, lineHeight: 1.15 }}>Hospitals see results in 90 days.</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 56 }}>
            {[
              { v: "−23%", l: "ED overtime hours", c: "#0d9488" },
              { v: "−47min", l: "Average wait time", c: "#1e6091" },
              { v: "+18%", l: "Bed utilization", c: "#0d9488" },
              { v: "$2.4M", l: "Annual savings (avg)", c: "#1e6091" },
            ].map((s) => (
              <div key={s.l} style={{ padding: 32, background: "#fafbfc", borderRadius: 12, textAlign: "center", border: "1px solid #eef0f3" }}>
                <div style={{ fontSize: 48, fontWeight: 600, color: s.c, letterSpacing: "-1.2px", lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 0,
            borderRadius: 16, overflow: "hidden", background: "#fafbfc", border: "1px solid #eef0f3",
          }}>
            <div style={{
              background: `linear-gradient(135deg, rgba(15,23,41,0.55) 0%, rgba(30,96,145,0.4) 100%), url(images/team-bg1.jpg)`,
              backgroundSize: "cover", backgroundPosition: "center",
              minHeight: 360,
            }} />
            <div style={{ padding: 48, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 56, color: "#0d9488", fontFamily: "Georgia, serif", lineHeight: 1, marginBottom: 8 }}>"</div>
              <p style={{ fontSize: 22, lineHeight: 1.5, color: "#0f172a", fontWeight: 500, margin: "0 0 24px 0", letterSpacing: "-0.2px" }}>
                We replaced a 14-spreadsheet weekly planning ritual with one dashboard. Our staffing decisions are now defensible to the board, and we caught the spring respiratory surge a week earlier than last year.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #1e6091, #0d9488)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>SM</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>Dr. Sarah Mitchell</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Operations Director · Memorial General</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* INTEGRATIONS / SECURITY STRIP */}
      <div style={{ padding: "80px 56px", background: "#fafbfc" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
          <div style={{ padding: 32, background: "white", borderRadius: 16, border: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#1e6091", textTransform: "uppercase", marginBottom: 12 }}>Integrations</div>
            <h3 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px 0" }}>Connects to your stack on day 1</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {["Epic FHIR", "Cerner", "Meditech", "NOAA Weather", "Workday", "Kronos", "Snowflake", "Supabase", "S3 / Azure"].map((c) => (
                <div key={c} style={{ padding: "12px 10px", border: "1px solid #eef0f3", borderRadius: 6, fontSize: 13, color: "#334155", textAlign: "center", fontWeight: 500 }}>{c}</div>
              ))}
            </div>
          </div>

          <div style={{ padding: 32, background: "white", borderRadius: 16, border: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: "#0d9488", textTransform: "uppercase", marginBottom: 12 }}>Security & compliance</div>
            <h3 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px 0" }}>HIPAA-ready, audit-friendly, vendor-vetted</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                "HIPAA · SOC 2 Type II · ISO 27001",
                "PHI never leaves your VPC · on-prem option",
                "Full model lineage & decision audit trail",
                "Role-based access · SAML SSO · MFA",
                "BAA available · GDPR-compliant for EU deployments",
              ].map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="check" size={11}/>
                  </span>
                  {c}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        padding: "100px 56px",
        background: `linear-gradient(110deg, rgba(15,23,41,0.92) 0%, rgba(30,96,145,0.85) 60%, rgba(13,148,136,0.55) 100%), url(images/dashboard-bg2.jpg)`,
        backgroundSize: "cover", backgroundPosition: "center",
        color: "white", textAlign: "center",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 20px 0" }}>
            Stop guessing.<br/>Start forecasting.
          </h2>
          <p style={{ fontSize: 17, color: "#cbd5e1", margin: "0 0 36px 0", lineHeight: 1.6 }}>
            Spin up a sandbox with your last 6 months of arrival data and see your first forecast in under an hour.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button style={{ padding: "16px 32px", background: "white", color: "#0f1729", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Start free trial
            </button>
            <button style={{ padding: "16px 32px", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(8px)", color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Talk to engineering
            </button>
          </div>
          <div style={{ marginTop: 28, fontSize: 12, color: "#94a3b8" }}>
            No credit card · 30-day pilot · BAA on day 1
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: "#0a1120", color: "#94a3b8", padding: "48px 56px 32px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "linear-gradient(135deg, #2f86c4, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "white" }}>HF</div>
              <div style={{ color: "white", fontSize: 14, fontWeight: 600 }}>HealthForecast AI</div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>Demand intelligence for hospital operations. Built by clinicians, ML engineers, and ops directors.</div>
          </div>
          {[
            { t: "Product", l: ["Dashboard", "Models", "Forecast", "Action Center", "Pricing"] },
            { t: "Resources", l: ["Documentation", "Case studies", "Blog", "Changelog"] },
            { t: "Company", l: ["About", "Customers", "Careers", "Press"] },
            { t: "Legal", l: ["Privacy", "Terms", "BAA", "Security"] },
          ].map((c) => (
            <div key={c.t}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>{c.t}</div>
              {c.l.map((i) => <div key={i} style={{ fontSize: 13, padding: "5px 0" }}>{i}</div>)}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1320, margin: "32px auto 0", paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, display: "flex", justifyContent: "space-between" }}>
          <div>© 2026 HealthForecast AI. All rights reserved.</div>
          <div>Made for hospitals · HIPAA-compliant · v3.2</div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageLanding });
