/* HealthForecast AI Redesign — Pages part 2
   Baselines, Train Models, Forecast, Staff, Supply, Action Center */

const PageBaseline = () => {
  const series = Array.from({ length: 60 }, (_, i) => 140 + Math.sin(i / 4) * 25 + i * 0.4);
  return (
    <div className="content">
      <PageHero
        kicker="Modeling · Step 1"
        title="Baseline Models"
        sub="Establish a benchmark before training ML models · naïve, seasonal naïve, exponential smoothing, Holt-Winters, SARIMA"
        image="images/prepare-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14}/>Retrain</button>
          <button className="btn btn-primary"><Icon name="play" size={14}/>Run all</button>
        </>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        {/* Configuration */}
        <div className="card">
          <div className="card-header"><div className="card-title">Configuration</div></div>
          <div className="card-body">
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Target</label>
              <select className="select"><option>Patient arrivals (daily)</option></select>
            </div>
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Train / test split</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="input" defaultValue="80" /> <input className="input" defaultValue="20" />
              </div>
            </div>
            <div className="field-group" style={{ marginBottom: 14 }}>
              <label className="label">Forecast horizon</label>
              <select className="select"><option>7 days</option><option>14 days</option></select>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#334155", margin: "16px 0 10px" }}>
              Baselines to run
            </div>
            {[
              ["Naïve (last value)", true],
              ["Seasonal naïve (lag-7)", true],
              ["Moving average", true],
              ["Exponential smoothing", true],
              ["Holt-Winters", true],
              ["SARIMA", false],
            ].map(([n, on]) => (
              <label key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
                <input type="checkbox" defaultChecked={on} /> {n}
              </label>
            ))}

            <div style={{ marginTop: 16, padding: 12, background: "#fafbfc", borderRadius: 6, fontSize: 12, color: "#64748b" }}>
              <strong style={{ color: "#0f172a" }}>Why baselines?</strong> Any ML model must beat these benchmarks to be worth deploying.
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Baseline forecast — test fold</div>
                <div className="card-sub">Last 244 days · all 5 baselines overlaid</div>
              </div>
            </div>
            <div className="card-body">
              <LineChart
                series={[
                  { data: series, color: "#94a3b8" },
                  { data: series.map((v) => v * 1.02), color: "#1e6091", dashed: true },
                  { data: series.map((v) => v * 0.95), color: "#0d9488", dashed: true },
                  { data: series.map((v) => v * 1.06), color: "#d97706", dashed: true },
                ]}
                xLabels={["", "−200d", "", "−150", "", "−100", "", "−50", "", "Today"]}
                height={220}
              />
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Baseline performance · ranked by MAPE</div></div>
            <table className="tbl">
              <thead><tr><th>#</th><th>Model</th><th>MAPE</th><th>RMSE</th><th>MAE</th><th>Train (s)</th><th></th></tr></thead>
              <tbody>
                {[
                  [1, "Holt-Winters", 9.2, 16.1, 12.4, 0.3, "best"],
                  [2, "SARIMA", 9.7, 17.2, 13.0, 4.1, ""],
                  [3, "Seasonal naïve (lag-7)", 11.4, 19.8, 15.2, 0.0, ""],
                  [4, "Exponential smoothing", 12.8, 22.0, 17.1, 0.2, ""],
                  [5, "Moving avg (7d)", 14.1, 24.2, 18.6, 0.0, ""],
                  [6, "Naïve", 18.4, 31.5, 24.0, 0.0, "worst"],
                ].map((r, i) => (
                  <tr key={i} style={{ background: i === 0 ? "#f0f5fa" : "transparent" }}>
                    <td style={{ width: 30 }} className="num">{r[0]}</td>
                    <td>{r[1]}{r[6] === "best" && <span className="tag tag-success" style={{ marginLeft: 8 }}>Best</span>}</td>
                    <td className="num">{r[2]}%</td>
                    <td className="num">{r[3]}</td>
                    <td className="num">{r[4]}</td>
                    <td className="num">{r[5]}s</td>
                    <td style={{ width: 60 }}><a style={{ fontSize: 12, color: "#1e6091" }}>Inspect</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageTrain = () => (
  <div className="content">
    <PageHero
      kicker="Modeling · Step 2"
      title="Train Models"
      sub="Tune & train ML models on engineered features · LightGBM, XGBoost, ARIMA, SARIMAX, ANN, LSTM, hybrids"
      image="images/train-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="settings" size={14}/>HPO</button>
        <button className="btn btn-primary"><Icon name="play" size={14}/>Train all</button>
      </>}
    />

    {/* Run status banner */}
    <div className="card" style={{ background: "#f0f5fa", borderColor: "#1e6091", borderLeft: "3px solid #1e6091" }}>
      <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "#1e6091",
          display: "flex", alignItems: "center", justifyContent: "center", color: "white",
        }}><Icon name="cpu" size={18}/></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Training run #2026-04-30-014 · in progress</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>3 of 5 models complete · ETA 2m 14s</div>
          <div className="bar" style={{ marginTop: 8 }}>
            <div className="bar-fill" style={{ width: "62%" }} />
          </div>
        </div>
        <button className="btn">Cancel</button>
      </div>
    </div>

    {/* Model cards grid */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
      {[
        { name: "LightGBM", status: "complete", mape: 6.4, rmse: 11.2, time: "1m 18s", color: "#1e6091", best: true },
        { name: "XGBoost", status: "complete", mape: 7.1, rmse: 12.6, time: "2m 03s", color: "#0d9488" },
        { name: "Prophet", status: "complete", mape: 8.3, rmse: 14.8, time: "0m 41s", color: "#d97706" },
        { name: "TFT (Temporal Fusion)", status: "running", mape: null, rmse: null, time: "—", color: "#7c3aed" },
        { name: "Ensemble (avg)", status: "queued", mape: null, rmse: null, time: "—", color: "#475569" },
        { name: "Stacked ensemble", status: "queued", mape: null, rmse: null, time: "—", color: "#475569" },
      ].map((m) => (
        <div key={m.name} className="card" style={{ position: "relative" }}>
          {m.best && <div style={{ position: "absolute", top: 12, right: 12 }}><span className="tag tag-success">Best</span></div>}
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: m.color, color: "white", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="cpu" size={16}/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {m.status === "complete" ? "Trained · " + m.time :
                   m.status === "running" ? <span style={{ color: "#1e6091" }}>● Training…</span> :
                   "Waiting in queue"}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["MAPE", m.mape ? m.mape + "%" : "—"], ["RMSE", m.rmse ?? "—"], ["MAE", m.mape ? (m.mape * 1.5).toFixed(1) : "—"]].map(([l, v]) => (
                <div key={l} style={{ padding: 8, background: "#fafbfc", borderRadius: 4 }}>
                  <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{l}</div>
                  <div className="mono tnum" style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>

            {m.mape && (
              <div style={{ marginTop: 12 }}>
                <Sparkline data={[20, 15, 12, 9, 8, 7, m.mape]} color={m.color} width={280} height={32} />
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Validation MAPE across 7 CV folds</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {m.status === "complete" && <>
                <button className="btn btn-sm">Inspect</button>
                <button className="btn btn-sm">Tune</button>
                <button className="btn btn-sm" style={{ marginLeft: "auto" }}>Deploy</button>
              </>}
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Feature importance */}
    <div className="card">
      <div className="card-header">
        <div className="card-title">Feature importance · LightGBM (best model)</div>
        <div className="card-sub">SHAP values · top 12 features</div>
      </div>
      <div style={{ padding: "8px 16px 16px" }}>
        {[
          ["lag_7", 0.95], ["temperature_max", 0.78], ["day_of_week", 0.66], ["lag_1", 0.58],
          ["rolling_mean_14", 0.51], ["is_holiday", 0.43], ["humidity_avg", 0.36], ["month", 0.31],
          ["air_quality_idx", 0.24], ["is_school_day", 0.19], ["lag_30", 0.15], ["precipitation", 0.11],
        ].map(([n, v]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 0" }}>
            <span className="mono" style={{ width: 160, fontSize: 12, color: "#334155" }}>{n}</span>
            <div style={{ flex: 1, height: 12, background: "#f0f2f5", borderRadius: 2, position: "relative" }}>
              <div style={{ height: "100%", width: `${v * 100}%`, background: "#1e6091", borderRadius: 2 }} />
            </div>
            <span className="mono tnum" style={{ width: 60, fontSize: 12, color: "#0f172a", textAlign: "right" }}>{v.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const PageForecast = () => {
  const hist = Array.from({ length: 30 }, (_, i) => 145 + Math.sin(i / 3) * 18 + i * 0.4);
  const fc = [188, 195, 218, 232, 215, 188, 174];
  const upper = fc.map((v) => v * 1.12);
  const lower = fc.map((v) => v * 0.88);

  return (
    <div className="content">
      <PageHero
        kicker="Forecast · Live"
        title="Patient Forecast"
        sub="7-day-ahead patient arrival predictions with 95% prediction intervals · informs staffing and supply"
        image="images/forecast-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="refresh" size={14}/>Re-run</button>
          <button className="btn btn-primary"><Icon name="download" size={14}/>Export</button>
        </>}
      />

      {/* Forecast cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {[
          ["Mon May 4", 188, "low"],
          ["Tue May 5", 195, "med"],
          ["Wed May 6", 218, "high"],
          ["Thu May 7", 232, "peak"],
          ["Fri May 8", 215, "high"],
          ["Sat May 9", 188, "med"],
          ["Sun May 10", 174, "low"],
        ].map(([d, v, lvl], i) => {
          const tag = lvl === "peak" ? "danger" : lvl === "high" ? "warning" : lvl === "med" ? "info" : "success";
          const isPeak = lvl === "peak";
          return (
            <div key={d} className="card" style={{
              padding: 12, textAlign: "center",
              borderColor: isPeak ? "#dc2626" : "#e4e7eb",
              borderWidth: isPeak ? 2 : 1,
              background: isPeak ? "#fef5f5" : "white",
            }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{d}</div>
              <div className="tnum" style={{ fontSize: 28, fontWeight: 600, color: "#0f172a", margin: "6px 0", letterSpacing: "-0.5px" }}>{v}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>±{Math.round(v * 0.12)} (95% PI)</div>
              <div style={{ marginTop: 6 }}>
                <span className={"tag tag-" + tag} style={{ fontSize: 10 }}>
                  {lvl === "peak" ? "Peak day" : lvl === "high" ? "High" : lvl === "med" ? "Normal" : "Low"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main chart */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">30-day history + 7-day forecast</div>
            <div className="card-sub">95% prediction interval · 7-day MAE on holdout: 11.4 patients</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm" style={{ background: "#e8f1f8", color: "#1e6091", borderColor: "#1e6091" }}>Daily</button>
            <button className="btn btn-sm">Hourly</button>
            <button className="btn btn-sm">Weekly</button>
          </div>
        </div>
        <div className="card-body">
          <LineChart
            series={[
              { data: [...hist, ...Array(7).fill(0)], color: "#475569" },
              {
                data: [...Array(29).fill(0), hist[29], ...fc],
                color: "#0d9488",
                band: { upper: [...Array(29).fill(0), hist[29], ...upper], lower: [...Array(29).fill(0), hist[29], ...lower] },
              },
            ]}
            xLabels={["−30d","−25","−20","−15","−10","−5","Today","+2","+4","+6","+7d"]}
            height={260}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Forecast by clinical category</div>
            <div className="card-sub">Seasonal proportions · 7-day total</div>
          </div>
          <table className="tbl">
            <thead><tr><th>Category</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th className="num">Total</th></tr></thead>
            <tbody>
              {[
                ["Respiratory", 53, 55, 61, 65, 60, 53, 49, 396],
                ["Cardiac", 41, 43, 48, 51, 47, 41, 38, 309],
                ["Trauma", 30, 31, 35, 37, 34, 30, 28, 225],
                ["GI", 26, 27, 31, 32, 30, 26, 24, 196],
                ["Infectious", 21, 21, 24, 26, 24, 21, 19, 156],
                ["Other", 17, 18, 19, 21, 20, 17, 16, 128],
              ].map((r) => (
                <tr key={r[0]}>
                  <td>{r[0]}</td>
                  {r.slice(1, 8).map((v, i) => <td key={i} className="num">{v}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{r[8]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Forecast quality</div></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { l: "MAPE (last 30d)", v: "6.4%", c: "#16a34a", b: 92 },
              { l: "Coverage (95% PI)", v: "94.2%", c: "#16a34a", b: 94 },
              { l: "Bias", v: "+1.2", c: "#d97706", b: 70 },
              { l: "Sharpness", v: "Good", c: "#16a34a", b: 86 },
            ].map((s) => (
              <div key={s.l}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "#334155" }}>{s.l}</span>
                  <span className="mono tnum" style={{ color: s.c, fontWeight: 600 }}>{s.v}</span>
                </div>
                <div className="bar"><div className="bar-fill" style={{ width: s.b + "%", background: s.c }} /></div>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: 12, background: "#fafbfc", borderRadius: 6, fontSize: 12, color: "#475569" }}>
              <strong style={{ color: "#0f172a" }}>Recommendation:</strong> Forecast quality is good. Thursday peak is well-supported by the past 8 weeks of data.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PageStaff = () => (
  <div className="content">
    <PageHero
      kicker="Planning · Staff"
      title="Staff Planner"
      sub="Optimal RN, MD, and tech schedules for the 7-day forecast · coverage, overtime, and weekly cost"
      image="images/staff-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="refresh" size={14}/>Re-optimize</button>
        <button className="btn btn-primary"><Icon name="check" size={14}/>Approve</button>
      </>}
    />

    {/* KPIs */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Coverage" value="94.2" unit="%" trend="+2.1%" trendDir="up" foot="vs. last week" />
      <KPI label="Total staff/wk" value="312" unit="shifts" foot="48 RNs · 12 MDs · 18 techs" />
      <KPI label="Overtime" value="84" unit="hrs" trend="-23%" trendDir="up" foot="vs. last week" />
      <KPI label="Weekly cost" value="$184k" trend="-$42k" trendDir="up" foot="vs. baseline" />
    </div>

    {/* Schedule grid */}
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Weekly schedule · May 4–10</div>
          <div className="card-sub">Demand vs. scheduled coverage</div>
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
          <span><span className="dot" style={{ color: "#1e6091" }} /> Demand</span>
          <span><span className="dot" style={{ color: "#0d9488" }} /> Scheduled</span>
          <span><span className="dot" style={{ color: "#d97706" }} /> Overtime</span>
        </div>
      </div>
      <div className="card-body">
        <svg viewBox="0 0 800 280" width="100%" height="280" preserveAspectRatio="none">
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="40" x2="780" y1={20 + i * 50} y2={20 + i * 50} stroke="#eef0f3" />)}
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
            <text key={d} x={40 + (i + 0.5) * 105} y={272} textAnchor="middle" fontSize="11" fill="#64748b">{d}</text>
          ))}
          {[20, 25, 30, 35, 40].map((v, i) => {
            const y = 220 - (v - 20) * 10;
            return <text key={v} x={32} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{v}</text>;
          })}
          {[28, 30, 35, 38, 36, 28, 25].map((demand, i) => {
            const sched = [27, 30, 33, 35, 35, 27, 26][i];
            const ot = Math.max(0, demand - sched);
            const cx = 40 + (i + 0.5) * 105;
            const dh = (demand - 20) * 10;
            const sh = (sched - 20) * 10;
            const oh = ot * 10;
            return (
              <g key={i}>
                <rect x={cx - 36} y={220 - dh} width={24} height={dh} fill="#1e6091" rx="2" />
                <rect x={cx - 8} y={220 - sh} width={24} height={sh} fill="#0d9488" rx="2" />
                <rect x={cx + 20} y={220 - oh} width={24} height={oh} fill="#d97706" rx="2" />
                <text x={cx} y={245} textAnchor="middle" fontSize="10" fill="#64748b">{demand}/{sched}{ot > 0 ? `+${ot}OT` : ""}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>

    {/* Roster table */}
    <div className="card">
      <div className="card-header">
        <div className="card-title">Roster · 32 RNs scheduled</div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="select" style={{ width: 130, height: 30, fontSize: 12 }}><option>RNs</option><option>MDs</option><option>Techs</option></select>
          <input className="input" placeholder="Search staff…" style={{ width: 200, height: 30, fontSize: 12 }} />
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>Staff</th><th>Role</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th><th className="num">Hrs</th><th>Status</th></tr></thead>
        <tbody>
          {[
            ["E. Rodriguez", "RN-3", "D", "D", "—", "D", "D", "—", "—", 32, "ok"],
            ["M. Chen", "RN-2", "—", "N", "N", "N", "—", "N", "—", 40, "ok"],
            ["K. Patel", "RN-4", "D", "D", "D", "D*", "D", "—", "—", 44, "overtime"],
            ["A. Johnson", "RN-2", "—", "—", "D", "D", "D", "D", "—", 32, "ok"],
            ["S. Kim", "RN-3", "N", "N", "—", "N*", "N*", "—", "—", 48, "overtime"],
            ["J. Williams", "RN-1", "—", "D", "D", "D", "D", "—", "D", 40, "ok"],
            ["T. Garcia", "RN-3", "—", "—", "—", "D?", "D", "D", "D", 28, "open"],
          ].map((r) => (
            <tr key={r[0]}>
              <td style={{ fontWeight: 500, color: "#0f172a" }}>{r[0]}</td>
              <td><span className="tag">{r[1]}</span></td>
              {r.slice(2, 9).map((v, i) => {
                const isOT = String(v).includes("*");
                const isOpen = String(v).includes("?");
                return (
                  <td key={i} className="mono" style={{ textAlign: "center" }}>
                    {v === "—" ? <span style={{ color: "#cbd5e1" }}>—</span> :
                     <span style={{
                       padding: "2px 6px", borderRadius: 3, fontWeight: 600,
                       background: isOpen ? "#fdf3e3" : isOT ? "#fbeaea" : v.startsWith("D") ? "#e8f1f8" : "#f0eafe",
                       color: isOpen ? "#d97706" : isOT ? "#dc2626" : v.startsWith("D") ? "#1e6091" : "#7c3aed",
                     }}>{v.replace("?", "")}</span>}
                  </td>
                );
              })}
              <td className="num">{r[9]}</td>
              <td>{r[10] === "ok" ? <span className="tag tag-success">OK</span> :
                   r[10] === "overtime" ? <span className="tag tag-warning">OT</span> :
                   <span className="tag tag-danger">Open</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const PageSupply = () => (
  <div className="content">
    <PageHero
      kicker="Planning · Supply"
      title="Supply Planner"
      sub="Inventory levels, reorder points, and projected stockouts driven by the demand forecast · 247 SKUs across PPE, fluids, pharm, disposables"
      image="images/supply-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="filter" size={14}/>Filter</button>
        <button className="btn btn-primary"><Icon name="bullhorn" size={14}/>Send orders (3)</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Service level" value="98.2" unit="%" trend="+0.4%" trendDir="up" foot="last 30 days" />
      <KPI label="Items at ROP" value="3" trend="+1" trendDir="down" foot="reorder needed" />
      <KPI label="Stockouts (forecast)" value="0" foot="next 7 days" />
      <KPI label="Inventory value" value="$1.42M" foot="across 247 SKUs" />
    </div>

    <div className="card">
      <div className="card-header">
        <div className="card-title">Inventory · 247 SKUs</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" style={{ background: "#e8f1f8", color: "#1e6091", borderColor: "#1e6091" }}>All</button>
          <button className="btn btn-sm">At ROP</button>
          <button className="btn btn-sm">Low stock</button>
          <button className="btn btn-sm">Excess</button>
        </div>
      </div>
      <table className="tbl">
        <thead><tr><th>SKU</th><th>Item</th><th>Category</th><th className="num">On hand</th><th className="num">ROP</th><th className="num">Days cover</th><th>Trend</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {[
            { sku: "N95-3M-1860", n: "N95 Respirator (3M 1860)", c: "PPE", h: 78, r: 120, d: 3.2, s: "low", spark: [200, 180, 160, 140, 120, 100, 78] },
            { sku: "GLOVE-NIT-M", n: "Nitrile gloves (M)", c: "PPE", h: 4200, r: 3000, d: 14.0, s: "ok", spark: [4400, 4350, 4300, 4280, 4250, 4220, 4200] },
            { sku: "IV-SAL-1L", n: "IV Saline 1L", c: "Fluids", h: 142, r: 200, d: 2.8, s: "low", spark: [320, 280, 240, 200, 180, 160, 142] },
            { sku: "SYRG-10ML", n: "Syringe 10mL", c: "Disposable", h: 1840, r: 800, d: 22.0, s: "ok", spark: [1900, 1880, 1870, 1860, 1850, 1845, 1840] },
            { sku: "OXY-MASK-A", n: "Oxygen mask (adult)", c: "Resp", h: 64, r: 80, d: 4.1, s: "low", spark: [160, 140, 120, 100, 90, 75, 64] },
            { sku: "EPI-1MG", n: "Epinephrine 1mg", c: "Pharm", h: 218, r: 150, d: 18.5, s: "ok", spark: [240, 235, 230, 225, 222, 220, 218] },
            { sku: "BAND-EL-4", n: "Elastic bandage 4\"", c: "Wound", h: 412, r: 200, d: 28.0, s: "excess", spark: [380, 390, 395, 400, 405, 410, 412] },
          ].map((it) => (
            <tr key={it.sku}>
              <td className="mono" style={{ color: "#1e6091" }}>{it.sku}</td>
              <td style={{ fontWeight: 500, color: "#0f172a" }}>{it.n}</td>
              <td><span className="tag">{it.c}</span></td>
              <td className="num">{it.h}</td>
              <td className="num" style={{ color: "#64748b" }}>{it.r}</td>
              <td className="num">{it.d}d</td>
              <td><Sparkline data={it.spark} color={it.s === "low" ? "#dc2626" : it.s === "excess" ? "#d97706" : "#0d9488"} width={80} height={22} /></td>
              <td>
                {it.s === "low" ? <span className="tag tag-danger">Below ROP</span> :
                 it.s === "excess" ? <span className="tag tag-warning">Excess</span> :
                 <span className="tag tag-success">OK</span>}
              </td>
              <td><button className="btn btn-sm">Order</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const PageActions = () => (
  <div className="content">
    <PageHero
      kicker="Operations · Action Center"
      title="Action Center"
      sub="Prioritized recommendations from the forecasting engine · staff, supply, and capacity moves with quantified impact"
      image="images/actions-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="download" size={14}/>Export</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Critical" value="2" foot="resolve today" />
      <KPI label="High priority" value="4" foot="this week" />
      <KPI label="Estimated savings" value="$48k" trend="this week" trendDir="up" />
      <KPI label="Resolution rate" value="91" unit="%" trend="+4%" trendDir="up" foot="last 30 days" />
    </div>

    <div className="tabs">
      <div className="tab active">All actions <span className="tag" style={{ marginLeft: 6 }}>12</span></div>
      <div className="tab">Staff <span className="tag" style={{ marginLeft: 6 }}>5</span></div>
      <div className="tab">Supply <span className="tag" style={{ marginLeft: 6 }}>3</span></div>
      <div className="tab">Capacity <span className="tag" style={{ marginLeft: 6 }}>4</span></div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[
        {
          p: "danger", t: "Critical",
          title: "Add 2 RNs to Thursday May 7 PM shift",
          desc: "Forecast shows +18% peak (232 patients). Current schedule has 28 RNs; optimal is 32. Estimated wait time impact if unstaffed: +47 min.",
          tags: ["Staff", "Thu May 7", "PM shift"],
          impact: "$8.4k",
          why: "ED arrival forecast is 232 (95% PI: 204-260). DOW pattern + heatwave forecast for Thu both push demand.",
        },
        {
          p: "danger", t: "Critical",
          title: "Reorder N95 respirators (3M 1860)",
          desc: "Stock at 78 units, ROP is 120. At forecast burn rate of 24/day, projected stockout in 3.2 days. Lead time is 5 days.",
          tags: ["Supply", "PPE", "5d lead"],
          impact: "Prevent stockout",
          why: "Respiratory case forecast is 396 over next 7 days (+12% vs. baseline).",
        },
        {
          p: "warning", t: "High",
          title: "Open cardiac overflow capacity",
          desc: "Cardiac admissions forecast at 309 (vs. 285 capacity). Activate 6-bed overflow on telemetry floor 3.",
          tags: ["Capacity", "Cardiac"],
          impact: "$12.0k",
          why: "Cardiac forecast +8.4% vs. trailing 4-week average.",
        },
        {
          p: "warning", t: "High",
          title: "Reorder IV Saline 1L (200 units)",
          desc: "Days cover at 2.8 days. Suggested order: 400 units to reach 7-day buffer.",
          tags: ["Supply", "Fluids"],
          impact: "Prevent stockout",
          why: "Higher-than-usual saline burn rate over past 14 days.",
        },
        {
          p: "info", t: "Medium",
          title: "Approve shift swap: Dr. Chen Wed AM ↔ Fri PM",
          desc: "Coverage maintained on both days. No overtime impact.",
          tags: ["Staff", "Approval"],
          impact: "—",
        },
      ].map((a, i) => (
        <div key={i} className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 4, alignSelf: "stretch", background: a.p === "danger" ? "#dc2626" : a.p === "warning" ? "#d97706" : "#2563eb", borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className={"tag tag-" + a.p}>{a.t}</span>
                {a.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                {a.impact !== "—" && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, marginLeft: "auto" }}>Impact: {a.impact}</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{a.title}</div>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{a.desc}</div>
              {a.why && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#fafbfc", borderRadius: 6, fontSize: 12, color: "#64748b" }}>
                  <strong style={{ color: "#1e6091" }}>Why:</strong> {a.why}
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 110 }}>
              <button className="btn btn-primary btn-sm">Approve</button>
              <button className="btn btn-sm">Snooze</button>
              <button className="btn btn-sm">Dismiss</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

Object.assign(window, { PageBaseline, PageTrain, PageForecast, PageStaff, PageSupply, PageActions });
