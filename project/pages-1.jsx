/* HealthForecast AI Redesign — Pages part 1
   Welcome, Dashboard, Upload, Explore */

const PageWelcome = () => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100%" }}>
    {/* Left side — branding with hospital photo background */}
    <div style={{
      background: `linear-gradient(160deg, rgba(15,23,41,0.92) 0%, rgba(30,58,95,0.85) 60%, rgba(30,96,145,0.7) 100%), url(images/login-bg1.jpg)`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      padding: "48px 56px",
      color: "white",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 2 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, #2f86c4, #0d9488)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 16,
        }}>HF</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>HealthForecast AI</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Hospital Demand Intelligence</div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#7dd3fc", textTransform: "uppercase", marginBottom: 12 }}>
          Hospital Operations Platform
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.2, margin: "0 0 16px 0", letterSpacing: "-0.5px" }}>
          Forecast patient demand.<br/>
          <span style={{ color: "#7dd3fc" }}>Plan staff and supply with confidence.</span>
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "#cbd5e1", maxWidth: 460, margin: 0 }}>
          End-to-end ML forecasting for emergency departments — from raw data to optimized weekly schedules and supply orders.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 32, maxWidth: 460 }}>
          {[
            { v: "96%", l: "Forecast accuracy" },
            { v: "23%", l: "Overtime reduction" },
            { v: "7d", l: "Forward horizon" },
          ].map((s) => (
            <div key={s.l}>
              <div style={{ fontSize: 24, fontWeight: 600, color: "white", letterSpacing: "-0.5px" }}>{s.v}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#64748b", position: "relative", zIndex: 2 }}>
        © 2026 HealthForecast AI · HIPAA-compliant
      </div>

      {/* Decorative grid */}
      <svg style={{ position: "absolute", right: -40, top: 80, opacity: 0.08 }} width="500" height="500" viewBox="0 0 500 500">
        {Array.from({ length: 20 }).map((_, i) => (
          <line key={"h" + i} x1="0" x2="500" y1={i * 25} y2={i * 25} stroke="white" strokeWidth="0.5" />
        ))}
        {Array.from({ length: 20 }).map((_, i) => (
          <line key={"v" + i} y1="0" y2="500" x1={i * 25} x2={i * 25} stroke="white" strokeWidth="0.5" />
        ))}
        <path d="M0 350 L 100 320 L 200 280 L 300 200 L 400 240 L 500 100" fill="none" stroke="#7dd3fc" strokeWidth="2" />
        <path d="M0 380 L 100 360 L 200 340 L 300 280 L 400 300 L 500 220" fill="none" stroke="#0d9488" strokeWidth="2" strokeDasharray="4 4" />
      </svg>
    </div>

    {/* Right side — login */}
    <div style={{ background: "white", padding: "48px 56px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ maxWidth: 380, width: "100%", margin: "0 auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, color: "#0f172a", margin: "0 0 6px 0", letterSpacing: "-0.3px" }}>
          Sign in to your hospital
        </h2>
        <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 28px 0" }}>
          Use your hospital credentials. SSO available for enterprise plans.
        </p>

        <div className="field-group" style={{ marginBottom: 14 }}>
          <label className="label">Email</label>
          <input className="input" defaultValue="s.mitchell@memorialgeneral.org" />
        </div>
        <div className="field-group" style={{ marginBottom: 6 }}>
          <label className="label">Password</label>
          <input className="input" type="password" defaultValue="••••••••••••" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <label style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" defaultChecked /> Keep me signed in
          </label>
          <a style={{ fontSize: 12, color: "#1e6091", textDecoration: "none" }}>Forgot password?</a>
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }}>
          Sign in
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0", color: "#94a3b8", fontSize: 11 }}>
          <div style={{ flex: 1, height: 1, background: "#e4e7eb" }} />
          <span>OR CONTINUE WITH</span>
          <div style={{ flex: 1, height: 1, background: "#e4e7eb" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button className="btn">SAML SSO</button>
          <button className="btn">Microsoft</button>
        </div>

        <div style={{ marginTop: 28, padding: 14, background: "#f0f5fa", borderRadius: 8, fontSize: 12, color: "#334155" }}>
          <strong style={{ color: "#1e6091" }}>Demo mode</strong> — Click Sign in with the prefilled credentials to explore as Operations Director.
        </div>
      </div>
    </div>
  </div>
);

const PageDashboard = () => {
  const last30 = [120, 135, 128, 142, 148, 138, 145, 152, 160, 155, 148, 162, 158, 165, 170, 168, 172, 175, 168, 178, 180, 175, 182, 188, 184, 190, 186, 192, 195, 198];
  const _hero = (
    <PageHero
      kicker="Operations · Live"
      title="Operations Dashboard"
      sub="Memorial General Hospital · Emergency Department · pipeline status, KPIs, today's forecast and open actions"
      image="images/dashboard-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="refresh" size={14}/>Refresh</button>
        <button className="btn"><Icon name="download" size={14}/>Export</button>
      </>}
    />
  );
  const next7 = [195, 200, 218, 232, 215, 188, 174];
  const dowAvg = [142, 156, 168, 175, 184, 162, 138];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Combined historical + forecast for main chart
  const histActual = [...last30, ...Array(7).fill(null)];
  const forecastLine = [...Array(29).fill(null), last30[29], ...next7];
  const forecastUpper = [null, ...Array(28).fill(null), last30[29], ...next7.map((v) => v * 1.12)];
  const forecastLower = [null, ...Array(28).fill(null), last30[29], ...next7.map((v) => v * 0.88)];

  return (
    <div className="content">
      {_hero}

      {/* Pipeline status */}
      <div className="steps">
        <div className="step done"><span className="step-num">✓</span>Data ingested</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>4 models trained</div>
        <span className="step-arrow">›</span>
        <div className="step current"><span className="step-num">3</span>Forecasts ready</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>Staff plan</div>
        <span className="step-arrow">›</span>
        <div className="step done"><span className="step-num">✓</span>Supply plan</div>
        <div style={{ marginLeft: "auto", paddingRight: 8 }}>
          <span className="tag tag-success"><span className="dot" /> Pipeline healthy</span>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <KPI label="Today's forecast" value="195" unit="patients" trend="+8.3%" trendDir="up" foot="vs. 30-day avg" spark={last30.slice(-14)} sparkColor="#1e6091" />
        <KPI label="7-day total" value="1,422" unit="patients" trend="+5.1%" trendDir="up" foot="vs. last week" spark={next7} sparkColor="#0d9488" />
        <KPI label="Peak day" value="232" unit="Thu" trend="+18.4%" trendDir="up" foot="vs. baseline" spark={[180, 195, 210, 232, 215, 188, 174]} sparkColor="#d97706" />
        <KPI label="Best model MAPE" value="6.4" unit="%" trend="-0.8%" trendDir="up" foot="LightGBM v3.2" spark={[8.2, 7.8, 7.5, 7.1, 6.9, 6.6, 6.4]} sparkColor="#7c3aed" />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Patient arrivals — 30 day history + 7 day forecast</div>
              <div className="card-sub">LightGBM model · 95% prediction interval shaded</div>
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748b" }}>
              <span><span className="dot" style={{ color: "#475569" }} /> Historical</span>
              <span><span className="dot" style={{ color: "#0d9488" }} /> Forecast</span>
              <span><span className="dot" style={{ color: "#0d9488", opacity: 0.3 }} /> 95% PI</span>
            </div>
          </div>
          <div className="card-body">
            <LineChart
              series={[
                { data: histActual.map((v) => v ?? 0), color: "#475569" },
                { data: forecastLine.map((v) => v ?? 0), color: "#0d9488",
                  band: { upper: forecastUpper.map((v) => v ?? 0), lower: forecastLower.map((v) => v ?? 0) }},
              ]}
              xLabels={["−30d","−25","−20","−15","−10","−5","Today","+2","+4","+6","+7d"]}
              height={260}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Day-of-week pattern</div>
          </div>
          <div className="card-body">
            <BarChart data={dowAvg} labels={days} color="#1e6091" height={220} />
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              Average daily arrivals by weekday · last 12 weeks
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Model leaderboard</div>
            <a style={{ fontSize: 12, color: "#1e6091" }}>View all</a>
          </div>
          <table className="tbl">
            <thead><tr><th>Model</th><th>MAPE</th><th>RMSE</th></tr></thead>
            <tbody>
              <tr><td><span className="tag tag-brand">LightGBM</span></td><td className="num">6.4%</td><td className="num">11.2</td></tr>
              <tr><td><span className="tag">XGBoost</span></td><td className="num">7.1%</td><td className="num">12.6</td></tr>
              <tr><td><span className="tag">Prophet</span></td><td className="num">8.3%</td><td className="num">14.8</td></tr>
              <tr><td><span className="tag">SARIMA</span></td><td className="num">9.7%</td><td className="num">17.2</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Clinical category mix</div>
          </div>
          <div className="card-body" style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <Donut size={140} thickness={22} data={[
              { value: 28, color: "#1e6091" },
              { value: 22, color: "#0d9488" },
              { value: 16, color: "#d97706" },
              { value: 14, color: "#7c3aed" },
              { value: 11, color: "#dc2626" },
              { value: 9, color: "#475569" },
            ]}/>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, flex: 1 }}>
              {[
                ["Respiratory", 28, "#1e6091"],
                ["Cardiac", 22, "#0d9488"],
                ["Trauma", 16, "#d97706"],
                ["GI", 14, "#7c3aed"],
                ["Infectious", 11, "#dc2626"],
                ["Other", 9, "#475569"],
              ].map(([n, v, c]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, background: c, borderRadius: 2 }} />
                  <span style={{ flex: 1, color: "#334155" }}>{n}</span>
                  <span className="tnum mono" style={{ color: "#0f172a", fontWeight: 600, fontSize: 11 }}>{v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Open actions</div>
            <span className="tag tag-warning">12 pending</span>
          </div>
          <div style={{ padding: "0 16px" }}>
            {[
              { p: "danger", t: "Add 2 RNs to Thursday PM shift", s: "Forecast spike +18%" },
              { p: "warning", t: "Reorder 80 N95 masks", s: "ROP reached" },
              { p: "warning", t: "Cardiac overflow plan", s: "Beds projected 94%" },
              { p: "info", t: "Approve Dr. Chen swap", s: "Wed AM ↔ Fri PM" },
            ].map((a, i) => (
              <div key={i} style={{
                padding: "10px 0",
                borderBottom: i < 3 ? "1px solid #eef0f3" : "none",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <span className={"tag tag-" + a.p} style={{ marginTop: 2 }}>
                  {a.p === "danger" ? "Critical" : a.p === "warning" ? "High" : "Med"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{a.t}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{a.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const PageUpload = () => (
  <div className="content">
    <PageHero
      kicker="Data · Sources"
      title="Data Hub"
      sub="Connect, upload, and validate the source data feeding your forecasts · Patient arrivals, weather, calendar, ICD-10 codes"
      image="images/hero-bg1.jpg"
      actions={<>
        <button className="btn"><Icon name="cloud" size={14}/>Connect API</button>
        <button className="btn btn-primary"><Icon name="upload" size={14}/>Upload CSV</button>
      </>}
    />

    {/* Source tiles */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      {[
        { name: "Patient arrivals", desc: "ED encounter records", count: "847,392 rows", status: "Connected", color: "success", icon: "hospital", source: "Epic FHIR" },
        { name: "Weather", desc: "Hourly temp, humidity, conditions", count: "2,847 days", status: "Connected", color: "success", icon: "cloud", source: "NOAA API" },
        { name: "Calendar", desc: "Holidays, school schedules, events", count: "366 days", status: "Connected", color: "success", icon: "file", source: "CSV upload" },
        { name: "Reason codes", desc: "ICD-10 chief complaint", count: "—", status: "Not connected", color: "warning", icon: "table", source: "Optional" },
      ].map((s) => (
        <div key={s.name} className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: s.color === "success" ? "var(--accent-soft)" : "var(--warning-soft)",
              color: s.color === "success" ? "var(--accent)" : "var(--warning)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Icon name={s.icon} size={16} /></div>
            <span className={"tag tag-" + s.color}>
              <span className="dot" /> {s.status}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{s.name}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{s.desc}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid #eef0f3" }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>{s.source}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#334155" }}>{s.count}</span>
          </div>
        </div>
      ))}
    </div>

    {/* Tabs */}
    <div className="card">
      <div className="card-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
        <div className="tabs" style={{ marginBottom: 0, border: "none" }}>
          <div className="tab active">Patient arrivals</div>
          <div className="tab">Weather</div>
          <div className="tab">Calendar</div>
          <div className="tab">Reason codes</div>
        </div>
      </div>

      <div className="card-body" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 24 }}>
        {/* Source config */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Source
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { n: "Epic FHIR API", on: true },
              { n: "Supabase / Postgres", on: false },
              { n: "CSV upload", on: false },
              { n: "S3 / Snowflake", on: false },
            ].map((o) => (
              <label key={o.n} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", border: "1px solid " + (o.on ? "#1e6091" : "#e4e7eb"),
                borderRadius: 6, fontSize: 13, cursor: "pointer",
                background: o.on ? "#e8f1f8" : "white",
                color: o.on ? "#1e6091" : "#334155", fontWeight: o.on ? 500 : 400,
              }}>
                <input type="radio" defaultChecked={o.on} style={{ margin: 0 }} />
                {o.n}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 20, fontSize: 12, fontWeight: 600, color: "#334155", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Date range
          </div>
          <div className="field-group" style={{ marginBottom: 8 }}>
            <input className="input" defaultValue="2023-01-01" />
          </div>
          <div className="field-group">
            <input className="input" defaultValue="2026-04-30" />
          </div>
          <div className="helper" style={{ marginTop: 6 }}>Covers 1,216 days · 3 years 4 months</div>

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 16, justifyContent: "center" }}>
            <Icon name="refresh" size={14} /> Sync now
          </button>
        </div>

        {/* Preview */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Preview · patient_arrivals</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>847,392 rows · 11 columns · last sync 2m ago</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="tag tag-success">Schema valid</span>
              <span className="tag">0.3% missing</span>
            </div>
          </div>
          <div style={{ border: "1px solid #e4e7eb", borderRadius: 6, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>encounter_id</th>
                  <th>arrival_ts</th>
                  <th>category</th>
                  <th>acuity</th>
                  <th>age_band</th>
                  <th className="num">los_min</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["enc_2491083", "2026-04-30 23:47", "Respiratory", "ESI-3", "65+", 184],
                  ["enc_2491082", "2026-04-30 23:42", "Cardiac", "ESI-2", "45-64", 312],
                  ["enc_2491081", "2026-04-30 23:38", "Trauma", "ESI-2", "18-44", 245],
                  ["enc_2491080", "2026-04-30 23:31", "GI", "ESI-3", "18-44", 156],
                  ["enc_2491079", "2026-04-30 23:24", "Infectious", "ESI-3", "0-17", 92],
                  ["enc_2491078", "2026-04-30 23:18", "Respiratory", "ESI-4", "65+", 138],
                  ["enc_2491077", "2026-04-30 23:11", "Cardiac", "ESI-1", "65+", 421],
                ].map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ color: "#1e6091" }}>{r[0]}</td>
                    <td className="mono">{r[1]}</td>
                    <td><span className="tag" style={{ fontSize: 10 }}>{r[2]}</span></td>
                    <td className="mono">{r[3]}</td>
                    <td>{r[4]}</td>
                    <td className="num">{r[5]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Validation summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
            {[
              { l: "Total rows", v: "847,392", c: "#0f172a" },
              { l: "Date coverage", v: "100%", c: "#16a34a" },
              { l: "Missing values", v: "2,541", c: "#d97706" },
              { l: "Duplicates", v: "0", c: "#16a34a" },
            ].map((s) => (
              <div key={s.l} style={{ padding: "10px 12px", background: "#fafbfc", border: "1px solid #eef0f3", borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{s.l}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: s.c, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PageExplore = () => {
  const series = Array.from({ length: 60 }, (_, i) => 140 + Math.sin(i / 4) * 25 + Math.cos(i / 9) * 18 + (i * 0.5));
  const heatData = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => Math.round(40 + Math.random() * 100))
  );

  return (
    <div className="content">
      <PageHero
        kicker="Data · EDA"
        title="Explore Data"
        sub="Distributions, seasonality, correlations · informs feature selection and model choice"
        image="images/explore-bg.jpg"
        actions={<>
          <button className="btn"><Icon name="filter" size={14}/>Filters</button>
          <button className="btn"><Icon name="download" size={14}/>Export</button>
        </>}
      />

      <div className="tabs">
        <div className="tab active"><Icon name="chart" size={13}/>Time series</div>
        <div className="tab">Distribution</div>
        <div className="tab">Seasonality</div>
        <div className="tab">Correlations</div>
        <div className="tab">Stationarity tests</div>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        {[
          { l: "Mean", v: "164.2" },
          { l: "Median", v: "162.0" },
          { l: "Std dev", v: "28.4" },
          { l: "Min / Max", v: "82 / 251" },
          { l: "Trend", v: "+0.42 /d", c: "#16a34a" },
          { l: "Strongest cycle", v: "7.0 d" },
        ].map((s) => (
          <div key={s.l} style={{ padding: "10px 14px", background: "white", border: "1px solid #e4e7eb", borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{s.l}</div>
            <div className="mono tnum" style={{ fontSize: 17, fontWeight: 600, color: s.c || "#0f172a", marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Main TS + decomposition */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Patient arrivals — full history with trend & seasonality</div>
            <div className="card-sub">Daily, 2023-01-01 → 2026-04-30</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sm">Raw</button>
            <button className="btn btn-sm" style={{ background: "#e8f1f8", color: "#1e6091", borderColor: "#1e6091" }}>Decomposed</button>
            <button className="btn btn-sm">Log</button>
          </div>
        </div>
        <div className="card-body">
          <LineChart
            series={[
              { data: series, color: "#475569" },
              { data: series.map((_, i) => 140 + i * 0.5), color: "#1e6091", dashed: true },
            ]}
            xLabels={["2023","Q2","Q3","Q4","2024","Q2","Q3","Q4","2025","Q2","Q3"]}
            height={220}
          />
        </div>
      </div>

      {/* Seasonality + corr */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Hour-of-day × day-of-week heatmap</div>
            <div className="card-sub">Average patient arrivals</div>
          </div>
          <div className="card-body">
            <Heatmap
              data={heatData}
              rows={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
              cols={Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}:00` : ""))}
              height={220}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#64748b" }}>
              <span>Lower</span>
              <div style={{ display: "flex", gap: 1 }}>
                {[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((o) => (
                  <div key={o} style={{ width: 24, height: 8, background: `rgba(30,96,145,${o})` }} />
                ))}
              </div>
              <span>Higher</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Top correlations with target</div>
          </div>
          <div style={{ padding: "4px 16px 16px" }}>
            {[
              ["temperature_max", -0.72, "#1e6091"],
              ["day_of_week", 0.61, "#1e6091"],
              ["is_holiday", 0.54, "#1e6091"],
              ["humidity_avg", 0.43, "#1e6091"],
              ["lag_7", 0.38, "#1e6091"],
              ["precipitation", -0.31, "#dc2626"],
              ["is_school_day", 0.24, "#1e6091"],
              ["air_quality", -0.18, "#dc2626"],
            ].map(([n, v, c]) => {
              const w = Math.abs(v) * 100;
              const isNeg = v < 0;
              return (
                <div key={n} style={{ padding: "8px 0", borderBottom: "1px solid #eef0f3" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span className="mono" style={{ color: "#334155" }}>{n}</span>
                    <span className="mono tnum" style={{ color: c, fontWeight: 600 }}>{v > 0 ? "+" : ""}{v}</span>
                  </div>
                  <div style={{ position: "relative", height: 4, background: "#f0f2f5", borderRadius: 2 }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#cbd5e1" }} />
                    <div style={{
                      position: "absolute",
                      left: isNeg ? `${50 - w/2}%` : "50%",
                      width: `${w / 2}%`,
                      top: 0, bottom: 0,
                      background: c,
                      borderRadius: 2,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageWelcome, PageDashboard, PageUpload, PageExplore });
