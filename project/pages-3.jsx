/* HealthForecast AI Redesign — Pages part 3
   The 4 pages missing from earlier passes:
   Prepare Data, Feature Studio, Feature Selection, Model Results */

const PagePrepare = () => (
  <div className="content">
    <PageHero
      kicker="Data · Step 2"
      title="Prepare Data"
      sub="Fuse patient, weather, calendar, and reason-code datasets · build target columns and clean edge cases"
      image="images/prepare-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="refresh" size={14}/>Re-fuse</button>
        <button className="btn btn-primary"><Icon name="check" size={14}/>Save processed</button>
      </>}
    />

    {/* Pipeline */}
    <div className="steps">
      <div className="step done"><span className="step-num">✓</span>Inputs validated</div>
      <span className="step-arrow">›</span>
      <div className="step done"><span className="step-num">✓</span>Datasets merged</div>
      <span className="step-arrow">›</span>
      <div className="step current"><span className="step-num">3</span>Targets built (1–7d)</div>
      <span className="step-arrow">›</span>
      <div className="step"><span className="step-num">4</span>Categories aggregated</div>
      <span className="step-arrow">›</span>
      <div className="step"><span className="step-num">5</span>Save to cache</div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
      {/* Settings */}
      <div className="card">
        <div className="card-header"><div className="card-title">Fusion settings</div></div>
        <div className="card-body">
          <div className="field-group" style={{ marginBottom: 12 }}>
            <label className="label">Join key</label>
            <select className="select"><option>arrival_date</option><option>datetime</option></select>
          </div>
          <div className="field-group" style={{ marginBottom: 12 }}>
            <label className="label">Forecast lags (days)</label>
            <input className="input" defaultValue="1, 2, 3, 4, 5, 6, 7" />
            <div className="helper">Build Target_1 … Target_7</div>
          </div>
          <div className="field-group" style={{ marginBottom: 12 }}>
            <label className="label">Edge handling</label>
            <select className="select"><option>Strict drop NA</option><option>Forward fill</option></select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
            <input type="checkbox" defaultChecked /> Aggregate clinical categories (6→3)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
            <input type="checkbox" defaultChecked /> Detect duplicate columns
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
            <input type="checkbox" /> One-hot encode categoricals
          </label>
        </div>
      </div>

      {/* Schema preview */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Merged dataset · processed_df</div>
            <div className="card-sub">1,216 rows × 47 columns · ready for feature engineering</div>
          </div>
          <span className="tag tag-success">Schema valid</span>
        </div>
        <table className="tbl">
          <thead><tr><th>Column</th><th>Type</th><th>Source</th><th className="num">Non-null</th><th className="num">Unique</th><th>Sample</th></tr></thead>
          <tbody>
            {[
              ["arrival_date", "date", "patient", 1216, 1216, "2026-04-30"],
              ["Total_Arrivals", "int", "patient", 1216, 184, "195"],
              ["Target_1 … Target_7", "int", "derived", 1209, 184, "188 / 195 / 218"],
              ["temperature_max", "float", "weather", 1216, 1102, "82.4"],
              ["humidity_avg", "float", "weather", 1214, 891, "64.2"],
              ["precipitation", "float", "weather", 1216, 412, "0.12"],
              ["is_holiday", "bool", "calendar", 1216, 2, "false"],
              ["is_school_day", "bool", "calendar", 1216, 2, "true"],
              ["day_of_week", "int", "derived", 1216, 7, "3"],
              ["respiratory_pct", "float", "reason", 1216, 612, "0.28"],
              ["cardiac_pct", "float", "reason", 1216, 584, "0.22"],
            ].map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "#1e6091" }}>{r[0]}</td>
                <td><span className="tag" style={{ fontSize: 10 }}>{r[1]}</span></td>
                <td>{r[2]}</td>
                <td className="num">{r[3].toLocaleString()}</td>
                <td className="num">{r[4]}</td>
                <td className="mono">{r[5]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Bottom row */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-header"><div className="card-title">Missing data heatmap</div></div>
        <div className="card-body">
          <Heatmap
            data={Array.from({ length: 6 }, () => Array.from({ length: 12 }, () => Math.random() * 8))}
            rows={["Total_Arr", "Temp", "Humidity", "Precip", "Holiday", "Reason"]}
            cols={["J","F","M","A","M","J","J","A","S","O","N","D"]}
            height={170}
          />
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>2,541 missing values · 0.3% of cells · concentrated in reason codes</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Target distribution</div></div>
        <div className="card-body">
          <BarChart
            data={[12, 38, 92, 184, 312, 256, 158, 84, 32, 14]}
            labels={["80","100","120","140","160","180","200","220","240","260"]}
            height={170}
            color="#0d9488"
          />
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>Histogram · arrivals/day · approx. normal, slight right skew</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Validation summary</div></div>
        <div style={{ padding: "8px 16px 16px" }}>
          {[
            ["Row count", "1,216", "#0f172a"],
            ["Date coverage", "100%", "#16a34a"],
            ["Missing values", "2,541 (0.3%)", "#d97706"],
            ["Duplicates", "0", "#16a34a"],
            ["Targets built", "7 / 7", "#16a34a"],
            ["Categoricals", "12 columns", "#0f172a"],
          ].map(([l, v, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eef0f3", fontSize: 13 }}>
              <span style={{ color: "#475569" }}>{l}</span>
              <span className="mono" style={{ color: c, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const PageFeatureStudio = () => (
  <div className="content">
    <PageHero
      kicker="Modeling · Feature engineering"
      title="Feature Studio"
      sub="Generate temporal, calendar, weather, and lag features · build train/val/test splits and CV folds"
      image="images/prepare-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="refresh" size={14}/>Regenerate</button>
        <button className="btn btn-primary"><Icon name="check" size={14}/>Save features</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Total features" value="74" foot="from 11 columns" />
      <KPI label="Train / Val / Test" value="70 / 15 / 15" unit="%" foot="time-ordered" />
      <KPI label="CV folds" value="5" foot="expanding window" />
      <KPI label="Multicollinearity" value="2" foot="pairs |r|>0.95" />
    </div>

    {/* Feature builder */}
    <div className="card">
      <div className="card-header">
        <div className="card-title">Feature recipes</div>
        <span className="tag tag-success">74 features built</span>
      </div>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {[
          { n: "Temporal", c: 12, ex: "day_of_week, month, quarter, day_of_year, week_of_year, is_weekend", on: true },
          { n: "Calendar", c: 8, ex: "is_holiday, days_to_holiday, is_school_day, is_payday", on: true },
          { n: "Lags", c: 21, ex: "lag_1, lag_2, … lag_7, lag_14, lag_30 (target × 7 horizons)", on: true },
          { n: "Rolling stats", c: 18, ex: "rolling_mean_7/14/30, rolling_std_7/14, rolling_max", on: true },
          { n: "Weather", c: 11, ex: "temp_max, humidity_avg, precip, dew_point, AQI, wind_speed", on: true },
          { n: "Fourier (yearly)", c: 4, ex: "sin/cos pairs at periods 365.25, 7", on: false },
        ].map((r) => (
          <div key={r.n} style={{
            border: "1px solid " + (r.on ? "#1e6091" : "#e4e7eb"),
            borderRadius: 8, padding: 14,
            background: r.on ? "#f0f5fa" : "white",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{r.n}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{r.c} features</div>
              </div>
              <label style={{ position: "relative", width: 32, height: 18 }}>
                <input type="checkbox" defaultChecked={r.on} style={{ opacity: 0, position: "absolute" }} />
                <span style={{
                  position: "absolute", inset: 0,
                  background: r.on ? "#1e6091" : "#cbd5e1",
                  borderRadius: 9, transition: "background .15s",
                }} />
                <span style={{
                  position: "absolute", top: 2, left: r.on ? 16 : 2,
                  width: 14, height: 14, background: "white", borderRadius: "50%",
                  transition: "left .15s",
                }} />
              </label>
            </div>
            <div className="mono" style={{ fontSize: 11, color: "#475569", lineHeight: 1.5 }}>{r.ex}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Split & CV viz */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Temporal split · 1,216 days</div>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", height: 30, borderRadius: 4, overflow: "hidden", border: "1px solid #e4e7eb" }}>
            <div style={{ flex: 70, background: "#1e6091", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>Train · 851d</div>
            <div style={{ flex: 15, background: "#0d9488", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>Val · 183d</div>
            <div style={{ flex: 15, background: "#d97706", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 }}>Test · 182d</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#64748b" }}>
            <span className="mono">2023-01-01</span>
            <span className="mono">2025-05-01</span>
            <span className="mono">2025-11-01</span>
            <span className="mono">2026-04-30</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Cross-validation · expanding window</div>
        </div>
        <div className="card-body">
          {[1, 2, 3, 4, 5].map((f) => {
            const tw = 30 + f * 10;
            return (
              <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span className="mono" style={{ width: 36, fontSize: 11, color: "#64748b" }}>F{f}</span>
                <div style={{ flex: 1, height: 14, background: "#f0f2f5", borderRadius: 2, position: "relative", display: "flex" }}>
                  <div style={{ width: tw + "%", background: "#1e6091" }} />
                  <div style={{ width: "10%", background: "#0d9488" }} />
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, display: "flex", gap: 12 }}>
            <span><span className="dot" style={{ color: "#1e6091" }} /> Train</span>
            <span><span className="dot" style={{ color: "#0d9488" }} /> Validate</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PageFeatureSelection = () => (
  <div className="content">
    <PageHero
      kicker="Modeling · Feature selection"
      title="Feature Selection"
      sub="Reduce 74 features to a parsimonious set using Lasso, mutual information, and gradient-boosting importance"
      image="images/prepare-bg.jpg"
      actions={<>
        <button className="btn btn-primary"><Icon name="play" size={14}/>Run selection</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Selected" value="18" unit="of 74" foot="76% reduction" />
      <KPI label="Method" value="Lasso CV" foot="α = 0.024" />
      <KPI label="Test MAPE" value="6.8" unit="%" trend="-0.4%" trendDir="up" foot="vs. all features" />
      <KPI label="Train time" value="−42" unit="%" foot="faster downstream" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">Selected features (top 18)</div>
          <select className="select" style={{ width: 140, height: 30, fontSize: 12 }}>
            <option>By Lasso coef</option>
            <option>By GB importance</option>
            <option>By Mutual Info</option>
          </select>
        </div>
        <table className="tbl">
          <thead><tr><th>Feature</th><th>Family</th><th className="num">|β|</th><th className="num">GB imp.</th><th className="num">MI</th><th>Status</th></tr></thead>
          <tbody>
            {[
              ["lag_7", "Lag", 0.812, 0.95, 0.71],
              ["temperature_max", "Weather", 0.624, 0.78, 0.58],
              ["day_of_week", "Temporal", 0.541, 0.66, 0.52],
              ["lag_1", "Lag", 0.487, 0.58, 0.47],
              ["rolling_mean_14", "Rolling", 0.421, 0.51, 0.42],
              ["is_holiday", "Calendar", 0.384, 0.43, 0.39],
              ["humidity_avg", "Weather", 0.312, 0.36, 0.34],
              ["month", "Temporal", 0.267, 0.31, 0.29],
              ["air_quality_idx", "Weather", 0.214, 0.24, 0.22],
              ["is_school_day", "Calendar", 0.184, 0.19, 0.18],
              ["lag_30", "Lag", 0.142, 0.15, 0.16],
              ["precipitation", "Weather", 0.118, 0.11, 0.13],
            ].map((r, i) => (
              <tr key={i}>
                <td className="mono" style={{ color: "#1e6091" }}>{r[0]}</td>
                <td><span className="tag" style={{ fontSize: 10 }}>{r[1]}</span></td>
                <td className="num">{r[2].toFixed(3)}</td>
                <td className="num">{r[3].toFixed(2)}</td>
                <td className="num">{r[4].toFixed(2)}</td>
                <td><span className="tag tag-success">Selected</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Lasso path</div></div>
        <div className="card-body">
          <LineChart
            series={[
              { data: [0.95, 0.82, 0.71, 0.58, 0.42, 0.31, 0.24, 0.18, 0.12, 0.08, 0.05, 0.03], color: "#1e6091" },
              { data: [0.78, 0.66, 0.54, 0.42, 0.31, 0.22, 0.17, 0.13, 0.09, 0.06, 0.04, 0.02], color: "#0d9488" },
              { data: [0.66, 0.55, 0.44, 0.32, 0.23, 0.17, 0.13, 0.10, 0.07, 0.05, 0.03, 0.02], color: "#d97706" },
              { data: [0.58, 0.47, 0.38, 0.28, 0.20, 0.15, 0.11, 0.08, 0.06, 0.04, 0.03, 0.01], color: "#7c3aed" },
            ]}
            xLabels={["10⁻³", "", "10⁻²", "", "α=0.024", "", "10⁻¹", "", "1", "", "10"]}
            height={200}
          />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
            Coefficient magnitude vs. regularization · vertical line shows optimal α
          </div>
        </div>

        <div className="card-header" style={{ borderTop: "1px solid #eef0f3" }}>
          <div className="card-title">CV score</div>
        </div>
        <div className="card-body">
          <Sparkline data={[8.4, 7.8, 7.2, 6.9, 6.8, 6.85, 7.1, 7.4, 7.9, 8.6]} color="#1e6091" width={300} height={60} />
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
            Test MAPE bottoms at 18 features · α = 0.024
          </div>
        </div>
      </div>
    </div>
  </div>
);

const PageResults = () => (
  <div className="content">
    <PageHero
      kicker="Modeling · Results"
      title="Model Results"
      sub="Comprehensive comparison · Diebold-Mariano tests, residual diagnostics, SHAP explainability across all trained models"
      image="images/results-bg.jpg"
      actions={<>
        <button className="btn"><Icon name="download" size={14}/>Download report</button>
        <button className="btn btn-primary"><Icon name="check" size={14}/>Promote LightGBM v3.2</button>
      </>}
    />

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <KPI label="Best model" value="LightGBM" unit="v3.2" foot="MAPE 6.4%" />
      <KPI label="Skill score" value="+38" unit="%" trend="vs. naïve" trendDir="up" />
      <KPI label="DM test" value="p < 0.01" foot="significantly better" />
      <KPI label="Coverage" value="94.2" unit="%" foot="95% PI calibrated" />
    </div>

    {/* Comparison table */}
    <div className="card">
      <div className="card-header">
        <div className="card-title">Model comparison · 7 trained models · 5-fold CV</div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th><th>Model</th><th className="num">MAPE</th><th className="num">RMSE</th><th className="num">MAE</th>
            <th className="num">sMAPE</th><th className="num">Skill</th><th>DM vs. best</th><th>Diagnostics</th>
          </tr>
        </thead>
        <tbody>
          {[
            [1, "LightGBM v3.2", 6.4, 11.2, 8.4, 6.1, "+38%", "—", "ok"],
            [2, "Stacked ensemble", 6.7, 11.6, 8.8, 6.4, "+36%", "p=0.42", "ok"],
            [3, "XGBoost", 7.1, 12.6, 9.3, 6.8, "+33%", "p=0.04 *", "ok"],
            [4, "LSTM", 7.4, 13.1, 9.7, 7.0, "+31%", "p=0.02 *", "ok"],
            [5, "ANN", 7.8, 13.8, 10.2, 7.4, "+28%", "p<0.01 **", "warn"],
            [6, "SARIMAX", 9.2, 16.1, 12.4, 8.8, "+18%", "p<0.01 **", "warn"],
            [7, "ARIMA", 11.4, 19.8, 15.2, 10.8, "+5%", "p<0.01 **", "fail"],
          ].map((r, i) => (
            <tr key={i} style={{ background: i === 0 ? "#f0f5fa" : "transparent" }}>
              <td className="num" style={{ width: 28 }}>{r[0]}</td>
              <td>{r[1]}{i === 0 && <span className="tag tag-success" style={{ marginLeft: 8 }}>Champion</span>}</td>
              <td className="num">{r[2]}%</td>
              <td className="num">{r[3]}</td>
              <td className="num">{r[4]}</td>
              <td className="num">{r[5]}%</td>
              <td className="num" style={{ color: "#16a34a", fontWeight: 600 }}>{r[6]}</td>
              <td className="mono" style={{ fontSize: 11 }}>{r[7]}</td>
              <td>
                {r[8] === "ok" ? <span className="tag tag-success">Pass</span> :
                 r[8] === "warn" ? <span className="tag tag-warning">Warn</span> :
                 <span className="tag tag-danger">Fail</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Bottom row */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
      <div className="card">
        <div className="card-header"><div className="card-title">Residual diagnostics · LightGBM</div></div>
        <div style={{ padding: "8px 16px 16px" }}>
          {[
            ["Ljung-Box (Q)", "p = 0.34", "pass"],
            ["Shapiro-Wilk", "p = 0.08", "pass"],
            ["Breusch-Pagan", "p = 0.21", "pass"],
            ["Bias (mean residual)", "+1.2", "warn"],
            ["ACF lag-1", "0.04", "pass"],
            ["ACF lag-7", "0.11", "pass"],
          ].map(([l, v, s]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #eef0f3" }}>
              <span style={{ fontSize: 13, color: "#475569" }}>{l}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono tnum" style={{ fontSize: 12, color: "#0f172a" }}>{v}</span>
                <span className={"tag tag-" + (s === "pass" ? "success" : "warning")}>{s === "pass" ? "✓" : "!"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">Actual vs. predicted</div></div>
        <div className="card-body">
          <svg viewBox="0 0 280 200" width="100%" height="200">
            <line x1="20" y1="180" x2="270" y2="180" stroke="#cbd5e1" />
            <line x1="20" y1="20" x2="20" y2="180" stroke="#cbd5e1" />
            <line x1="20" y1="180" x2="270" y2="20" stroke="#0d9488" strokeDasharray="4 4" strokeWidth="1.5" />
            {Array.from({ length: 80 }).map((_, i) => {
              const t = i / 80;
              const x = 20 + t * 250;
              const y = 180 - t * 160 + (Math.random() - 0.5) * 22;
              return <circle key={i} cx={x} cy={y} r="2.5" fill="#1e6091" opacity="0.55" />;
            })}
            <text x="20" y="195" fontSize="10" fill="#64748b">80</text>
            <text x="270" y="195" fontSize="10" fill="#64748b" textAnchor="end">260</text>
            <text x="14" y="180" fontSize="10" fill="#64748b" textAnchor="end">80</text>
            <text x="14" y="24" fontSize="10" fill="#64748b" textAnchor="end">260</text>
          </svg>
          <div style={{ fontSize: 11, color: "#64748b" }}>R² = 0.93 · 244 test points</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><div className="card-title">SHAP — top contributors</div></div>
        <div style={{ padding: "8px 16px 16px" }}>
          {[
            ["lag_7", 0.42, "+"],
            ["temperature_max", 0.31, "−"],
            ["day_of_week", 0.24, "+"],
            ["is_holiday", 0.18, "+"],
            ["rolling_mean_14", 0.14, "+"],
            ["humidity_avg", 0.11, "+"],
            ["month", 0.08, "+"],
          ].map(([n, v, s]) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
              <span className="mono" style={{ width: 110, fontSize: 12, color: "#334155" }}>{n}</span>
              <div style={{ flex: 1, height: 10, background: "#f0f2f5", borderRadius: 2, position: "relative", display: "flex" }}>
                <div style={{ width: "50%", display: "flex", justifyContent: "flex-end" }}>
                  {s === "−" && <div style={{ width: `${v * 200}%`, background: "#dc2626" }} />}
                </div>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#cbd5e1" }} />
                <div style={{ width: "50%" }}>
                  {s === "+" && <div style={{ width: `${v * 200}%`, background: "#1e6091" }} />}
                </div>
              </div>
              <span className="mono tnum" style={{ width: 40, fontSize: 11, textAlign: "right", color: s === "+" ? "#1e6091" : "#dc2626" }}>{s}{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { PagePrepare, PageFeatureStudio, PageFeatureSelection, PageResults });
