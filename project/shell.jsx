/* Shared layout components for HealthForecast AI redesign */
const { useState } = React;

const Icon = ({ name, size = 16 }) => {
  const icons = {
    home: "M3 12l9-9 9 9M5 10v10h14V10",
    dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
    upload: "M12 3v12m-5-5l5-5 5 5M4 17v3h16v-3",
    table: "M3 6h18M3 12h18M3 18h18M9 6v12M15 6v12",
    chart: "M3 20h18M6 16V8m4 8V4m4 12v-6m4 6V10",
    cpu: "M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6z",
    flask: "M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3",
    forecast: "M3 17l6-6 4 4 8-8M14 7h7v7",
    users: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM2 21v-1a6 6 0 0112 0v1M18 8a3 3 0 100 6M22 21v-1a4 4 0 00-3-3.87",
    box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    target: "M12 12m-9 0a9 9 0 1018 0a9 9 0 10-18 0M12 12m-5 0a5 5 0 1010 0a5 5 0 10-10 0M12 12m-1 0a1 1 0 102 0a1 1 0 10-2 0",
    bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
    plus: "M12 5v14M5 12h14",
    download: "M12 3v12m-5-5l5 5 5-5M4 17v3h16v-3",
    play: "M5 3l14 9-14 9V3z",
    check: "M5 12l5 5L20 7",
    arrow: "M5 12h14M13 5l7 7-7 7",
    file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6",
    zap: "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
    bolt: "M13 2L3 14h7l-1 8 10-12h-7l1-8z",
    bullhorn: "M3 11l18-8v18l-18-8v-2zM3 11v6a3 3 0 003 3h2",
    hospital: "M3 21h18M5 21V7l8-4 8 4v14M9 12h6M9 16h6M12 9v3",
    filter: "M3 4h18l-7 9v6l-4 2v-8z",
    refresh: "M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5",
    more: "M12 12m-1 0a1 1 0 102 0a1 1 0 10-2 0M5 12m-1 0a1 1 0 102 0a1 1 0 10-2 0M19 12m-1 0a1 1 0 102 0a1 1 0 10-2 0",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 12m-3 0a3 3 0 106 0a3 3 0 10-6 0",
    cloud: "M18 10a6 6 0 00-11.5-2A4 4 0 003 16h15a4 4 0 000-6z",
  };
  const d = icons[name] || icons.home;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
};

const Sidebar = ({ active = "dashboard" }) => {
  const items = [
    { section: "Overview", items: [
      { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    ]},
    { section: "Data", items: [
      { id: "upload", label: "Data Hub", icon: "upload" },
      { id: "prepare", label: "Prepare", icon: "table" },
      { id: "explore", label: "Explore", icon: "chart" },
    ]},
    { section: "Modeling", items: [
      { id: "baseline", label: "Baselines", icon: "flask" },
      { id: "features", label: "Feature Studio", icon: "cpu" },
      { id: "train", label: "Train Models", icon: "cpu" },
      { id: "results", label: "Results", icon: "target" },
    ]},
    { section: "Operations", items: [
      { id: "forecast", label: "Forecast", icon: "forecast" },
      { id: "staff", label: "Staffing", icon: "users", badge: "3" },
      { id: "supply", label: "Supply", icon: "box" },
      { id: "actions", label: "Action Center", icon: "bolt", badge: "12" },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">HF</div>
        <div>
          <div className="sidebar-brand-name">HealthForecast</div>
          <div className="sidebar-brand-sub">Memorial General Hospital</div>
        </div>
      </div>
      {items.map((sec) => (
        <React.Fragment key={sec.section}>
          <div className="sidebar-section">{sec.section}</div>
          <nav className="sidebar-nav">
            {sec.items.map((it) => (
              <div key={it.id} className={"sidebar-item" + (it.id === active ? " active" : "")}>
                <span className="sidebar-item-icon"><Icon name={it.icon} size={15} /></span>
                <span>{it.label}</span>
                {it.badge && <span className="sidebar-item-badge">{it.badge}</span>}
              </div>
            ))}
          </nav>
        </React.Fragment>
      ))}
      <div className="sidebar-footer">
        <div className="sidebar-avatar">SM</div>
        <div>
          <div className="sidebar-user-name">Dr. Sarah Mitchell</div>
          <div className="sidebar-user-role">Operations Director</div>
        </div>
      </div>
    </aside>
  );
};

const Topbar = ({ crumbs = [] }) => (
  <div className="topbar">
    <div className="topbar-crumbs">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="sep">/</span>}
          <span className={i === crumbs.length - 1 ? "current" : ""}>{c}</span>
        </React.Fragment>
      ))}
    </div>
    <div className="topbar-spacer" />
    <div className="topbar-search-wrap">
      <Icon name="search" size={14} />
      <input className="topbar-search" placeholder="Search dashboards, models, datasets…" />
    </div>
    <button className="topbar-action"><Icon name="bell" size={16} /></button>
    <button className="topbar-action"><Icon name="settings" size={16} /></button>
  </div>
);

const PageHead = ({ title, sub, actions, tag }) => (
  <div className="page-head">
    <div>
      <h1 className="page-head-title">
        {title}
        {tag && <span className="tag tag-brand" style={{ marginLeft: 10, verticalAlign: "middle" }}>{tag}</span>}
      </h1>
      <p className="page-head-sub">{sub}</p>
    </div>
    <div className="page-head-actions">{actions}</div>
  </div>
);

/* Hero banner with image background — matches Streamlit page-hero pattern */
const PageHero = ({ title, sub, image, actions, kicker, height = 160 }) => (
  <div style={{
    position: "relative",
    height,
    borderRadius: 12,
    overflow: "hidden",
    background: image
      ? `linear-gradient(90deg, rgba(15,23,41,0.92) 0%, rgba(30,96,145,0.72) 55%, rgba(13,148,136,0.35) 100%), url(${image})`
      : "linear-gradient(110deg, #0f1729 0%, #1e6091 100%)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: "white",
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    marginBottom: 4,
  }}>
    {kicker && (
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#7dd3fc", textTransform: "uppercase", marginBottom: 6 }}>
        {kicker}
      </div>
    )}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: "-0.4px", lineHeight: 1.15 }}>{title}</h1>
        {sub && <div style={{ fontSize: 14, color: "#cbd5e1", marginTop: 8, maxWidth: 720, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>{actions}</div>}
    </div>
  </div>
);

/* ---------- Tiny SVG charts ---------- */
const Sparkline = ({ data, color = "#1e6091", width = 80, height = 28, fill = true }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const w = width, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = path + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
};

const KPI = ({ label, value, unit, foot, trend, trendDir = "up", spark, sparkColor }) => (
  <div className="kpi">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">
      <span>{value}</span>
      {unit && <span className="kpi-unit">{unit}</span>}
    </div>
    <div className="kpi-foot">
      {trend && (
        <span className={"chip chip-" + trendDir}>
          {trendDir === "up" ? "↑" : trendDir === "down" ? "↓" : "→"} {trend}
        </span>
      )}
      {foot}
    </div>
    {spark && <div className="kpi-spark"><Sparkline data={spark} color={sparkColor} /></div>}
  </div>
);

/* Line chart */
const LineChart = ({ series, height = 220, yLabel, xLabels, showGrid = true }) => {
  const w = 720, h = height, pad = { l: 36, r: 12, t: 8, b: 22 };
  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(...allVals) * 1.1;
  const min = Math.min(0, Math.min(...allVals));
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const n = series[0].data.length;
  const x = (i) => pad.l + (i / (n - 1)) * innerW;
  const y = (v) => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + (i / yTicks) * (max - min));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {showGrid && tickVals.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#eef0f3" strokeWidth="1" />
          <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{Math.round(v)}</text>
        </g>
      ))}
      {xLabels && xLabels.map((lbl, i) => (
        <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{lbl}</text>
      ))}
      {series.map((s, si) => {
        const path = s.data.map((v, i) => (i === 0 ? "M" : "L") + x(i) + " " + y(v)).join(" ");
        return (
          <g key={si}>
            {s.dashed ? (
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="4 4" />
            ) : (
              <path d={path} fill="none" stroke={s.color} strokeWidth="2" />
            )}
            {s.band && (
              <path
                d={
                  s.band.upper.map((v, i) => (i === 0 ? "M" : "L") + x(i) + " " + y(v)).join(" ") +
                  " " +
                  s.band.lower.slice().reverse().map((v, i) => "L" + x(s.band.lower.length - 1 - i) + " " + y(v)).join(" ") +
                  " Z"
                }
                fill={s.color}
                opacity="0.12"
                stroke="none"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

/* Bar chart */
const BarChart = ({ data, height = 200, color = "#1e6091", labels, valueFmt = (v) => v }) => {
  const w = 720, h = height, pad = { l: 36, r: 12, t: 8, b: 22 };
  const max = Math.max(...data) * 1.15;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const bw = (innerW / data.length) * 0.6;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * t} y2={pad.t + innerH * t} stroke="#eef0f3" />
      ))}
      {data.map((v, i) => {
        const cx = pad.l + (i + 0.5) * (innerW / data.length);
        const bh = (v / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={pad.t + innerH - bh} width={bw} height={bh} fill={color} rx="2" />
            <text x={cx} y={h - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{labels[i]}</text>
            <text x={cx} y={pad.t + innerH - bh - 4} textAnchor="middle" fontSize="10" fill="#334155" fontWeight="500">{valueFmt(v)}</text>
          </g>
        );
      })}
    </svg>
  );
};

/* Donut */
const Donut = ({ data, size = 180, thickness = 26 }) => {
  const r = size / 2, ri = r - thickness;
  const total = data.reduce((s, d) => s + d.value, 0);
  let a = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {data.map((d, i) => {
        const frac = d.value / total;
        const a2 = a + frac * Math.PI * 2;
        const large = frac > 0.5 ? 1 : 0;
        const x1 = r + r * Math.cos(a), y1 = r + r * Math.sin(a);
        const x2 = r + r * Math.cos(a2), y2 = r + r * Math.sin(a2);
        const x3 = r + ri * Math.cos(a2), y3 = r + ri * Math.sin(a2);
        const x4 = r + ri * Math.cos(a), y4 = r + ri * Math.sin(a);
        const path = `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
        a = a2;
        return <path key={i} d={path} fill={d.color} />;
      })}
    </svg>
  );
};

/* Heatmap */
const Heatmap = ({ data, rows, cols, height = 200, max }) => {
  const w = 720, h = height, pad = { l: 60, r: 12, t: 10, b: 22 };
  const cellW = (w - pad.l - pad.r) / cols.length;
  const cellH = (h - pad.t - pad.b) / rows.length;
  const m = max || Math.max(...data.flat());
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {rows.map((rl, ri) => (
        <text key={"r" + ri} x={pad.l - 6} y={pad.t + (ri + 0.65) * cellH} textAnchor="end" fontSize="10" fill="#64748b">{rl}</text>
      ))}
      {cols.map((cl, ci) => (
        <text key={"c" + ci} x={pad.l + (ci + 0.5) * cellW} y={h - 6} textAnchor="middle" fontSize="10" fill="#64748b">{cl}</text>
      ))}
      {data.map((row, ri) =>
        row.map((v, ci) => {
          const t = v / m;
          return (
            <rect key={ri + "-" + ci}
              x={pad.l + ci * cellW + 1}
              y={pad.t + ri * cellH + 1}
              width={cellW - 2}
              height={cellH - 2}
              fill={`rgba(30,96,145,${0.12 + t * 0.8})`}
              rx="2"
            />
          );
        })
      )}
    </svg>
  );
};

/* AppShell — sidebar + topbar wrapper around any page */
const AppShell = ({ active = "dashboard", children }) => {
  const crumbMap = {
    dashboard: ["Operations", "Dashboard"],
    upload: ["Data", "Data Hub"],
    explore: ["Data", "Explore"],
    baseline: ["Modeling", "Baseline Models"],
    train: ["Modeling", "Train Models"],
    forecast: ["Modeling", "Forecast"],
    staff: ["Planning", "Staff"],
    supply: ["Planning", "Supply"],
    actions: ["Operations", "Action Center"],
  };
  return (
    <div className="app">
      <Sidebar active={active} />
      <div className="main">
        <Topbar crumbs={crumbMap[active] || ["Dashboard"]} />
        {children}
      </div>
    </div>
  );
};

Object.assign(window, { Icon, Sidebar, Topbar, PageHead, PageHero, KPI, Sparkline, LineChart, BarChart, Donut, Heatmap, AppShell });
