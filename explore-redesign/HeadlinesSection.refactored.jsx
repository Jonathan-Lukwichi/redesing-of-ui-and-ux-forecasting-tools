// ============================================================================
// REFACTORED HeadlinesSection — Pass 1 redesign.
// Paste this over the existing HeadlinesSection + its sub-card functions in
// src/pages/ExploreData.jsx (the block from `function HeadlinesSection` down to
// and including `function WhyThisMatters`). DELETE WhyThisMatters entirely.
//
// New imports to add at the top of ExploreData.jsx:
//   import OperationalCallout from '../components/OperationalCallout';
//   import TabHeadline from '../components/TabHeadline';
// (ActionPanel is already imported; apply PATCH-Charts-ActionPanel.jsx so the
//  titled/items checklist mode exists.)
//
// HeroStatInline already lives in this file — keep it.
// ============================================================================

// Prescribed Chapter 4 / 5 fallback numbers — shown when the live API metric
// strip is empty so the tab always tells the truth from the thesis.
const HEADLINE_KPI_FALLBACK = [
  { id: 'days',     label: 'Days of data',          value: '2,440',  unit: '',  sub: '5 years and 9 months',                                          accent: 'stable' },
  { id: 'arrivals', label: 'Total patient arrivals',value: '138,000',unit: '',  sub: 'across the full record',                                        accent: 'stable' },
  { id: 'avg',      label: 'Average daily arrivals', value: '58',     unit: '',  sub: 'typical day, post-COVID',                                       accent: 'stable' },
  { id: 'swing',    label: 'Daily swing',            value: '\u00b114', unit: '', sub: 'how much volume jumps around',                                  accent: 'watch'  },
  { id: 'spec',     label: 'Specialty count',        value: '5',      unit: '',  sub: 'Medicine, Orthopaedics, Surgery, Paediatrics, Gynaecology',     accent: 'trend'  },
  { id: 'complete', label: 'Data completeness',      value: '99.79',  unit: '%', sub: 'of expected days recorded',                                     accent: 'stable' },
  { id: 'shift',    label: '2025 regime shift',      value: '+18.3',  unit: '%', sub: 'mean shift on the 2025 test block',                             accent: 'watch'  },
];

const SECTION_FROM_CODE = {
  quality: 'quality', demand: 'demand', departments: 'departments',
  critical: 'critical', hours: 'hours', drivers: 'drivers',
};

function HeadlinesSection({ jumpTo }) {
  const [metrics, mErr]    = useAnalysis(() => api.explore.metrics('forecast'));
  const [findings, fErr]   = useAnalysis(() => api.explore.findings());
  const [profile, pErr]    = useAnalysis(() => api.explore.layer2HourlyProfile('g2'));
  const [calEffects, cErr] = useAnalysis(() => api.explore.task1CalendarEffects('g1'));
  const [mix, mixErr]      = useAnalysis(() => api.explore.task2SpecialtyMix('g3'));
  const [regimes, rErr]    = useAnalysis(() => api.explore.covidRegimes('g1'));

  if (mErr) return <ErrorBanner msg={mErr} />;
  if (!metrics) return <div style={{ padding: 24, color: '#64748b' }}>Computing dashboard…</div>;

  const liveKpis = metrics.metrics || [];
  const kpis = liveKpis.length ? liveKpis : HEADLINE_KPI_FALLBACK;
  const fList = findings?.findings || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TabHeadline
        kicker="Executive summary"
        title="Five years of arrivals, one operational rhythm, one 2025 shift to absorb"
        sub="Steve Biko Casualty Unit · 2,440 days · 138,000 patient arrivals · five specialties · one tertiary referral catchment"
      />

      {/* ---- KPI strip ---- */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(7, Math.max(kpis.length, 1))}, 1fr)`,
        gap: 12,
      }}>
        {kpis.map((m) => (
          <KPICard
            key={m.id}
            label={m.label}
            value={m.value}
            unit={m.unit}
            deltaPct={m.delta_pct}
            deltaLabel={m.delta_label}
            sparkline={m.sparkline}
            accent={m.accent}
            polarity={m.polarity || 'normal'}
          />
        ))}
      </div>

      {/* ---- Featured: hourly rhythm + day-of-week ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <FeaturedHourlyLines data={profile} loading={!profile && !pErr} err={pErr} />
        <FeaturedDayOfWeek data={calEffects} loading={!calEffects && !cErr} err={cErr} />
      </div>

      {/* ---- Three-column row: regime · mix · weekend ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <FeaturedRegimeDonut data={regimes} loading={!regimes && !rErr} err={rErr} />
        <DepartmentMixCard data={mix} loading={!mix && !mixErr} err={mixErr} />
        <WeekendEffectCard findings={fList} />
      </div>

      {/* ---- Full-width findings → action table ---- */}
      <KeyFindingsCard findings={fList} onJump={jumpTo} />
    </div>
  );
}

// ---- Headlines sub-cards ---------------------------------------------------

function FeaturedHourlyLines({ data, loading, err }) {
  const TITLE = 'Two-thirds of the unit\u2019s work happens between 09:00 and 17:00';
  if (err)     return <ChartCard title={TITLE} err={err} />;
  if (loading) return <ChartCard title={TITLE} loading />;
  if (!data?.dow_curves) return <ChartCard title={TITLE} subtitle="Requires hourly group G2" />;

  const curves = data.dow_curves;
  const weekdayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const weekendKeys = ['Sat', 'Sun'];
  const mean = (keys, h) => {
    const vals = keys.map((k) => (curves[k]?.[h] ?? null)).filter((v) => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };
  const weekdayCurve = Array.from({ length: 24 }, (_, h) => mean(weekdayKeys, h));
  const weekendCurve = Array.from({ length: 24 }, (_, h) => mean(weekendKeys, h));
  const peakHour = weekdayCurve.indexOf(Math.max(...weekdayCurve));
  const peakValue = weekdayCurve[peakHour];
  const troughHour = weekdayCurve.indexOf(Math.min(...weekdayCurve));
  const troughValue = weekdayCurve[troughHour];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{TITLE}</div>
          <div className="card-sub">Day and Evening shifts each see 41 percent of arrivals; Night sees 18 percent. The peak hours are 10:00 to 14:00.</div>
        </div>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', gap: 32, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #eef0f3' }}>
          <HeroStatInline kicker="Peak hour" value={`${peakHour.toString().padStart(2, '0')}:00`} sub={`${peakValue.toFixed(1)} arrivals/hour · weekday`} color="#0d9488" />
          <HeroStatInline kicker="Trough" value={`${troughHour.toString().padStart(2, '0')}:00`} sub={`${troughValue.toFixed(1)} arrivals/hour`} color="#64748b" />
          <HeroStatInline kicker="Peak-to-trough" value={`×${data.peak_to_trough_ratio ?? '—'}`} sub="weekday amplitude" color="#1e6091" />
        </div>
        <LineChart
          series={[{ data: weekdayCurve, color: '#1e6091' }, { data: weekendCurve, color: '#dc2626' }]}
          xLabels={['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h', '23h']}
          height={240}
        />
        <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 12, color: '#475569' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: '#1e6091', borderRadius: 2 }} /> Weekday (Mon–Fri)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: '#dc2626', borderRadius: 2 }} /> Weekend (Sat–Sun)
          </span>
        </div>
      </div>
    </div>
  );
}

// HeroStatInline — unchanged from the current file; keep the existing definition.

function FeaturedDayOfWeek({ data, loading, err }) {
  const TITLE = 'Mondays and Tuesdays are 12 percent busier than Wednesdays';
  if (err)     return <ChartCard title={TITLE} err={err} />;
  if (loading) return <ChartCard title={TITLE} loading />;
  if (!data?.day_of_week) return <ChartCard title={TITLE} subtitle="Requires G1 calendar features" />;

  const rows = data.day_of_week.map((r, i) => ({ label: data.day_of_week_labels?.[i] || `D${i}`, mean: r.mean || 0 }));
  const overall = rows.reduce((s, r) => s + r.mean, 0) / Math.max(rows.length, 1);
  const peak = rows.reduce((b, r) => (r.mean > b.mean ? r : b), rows[0]);
  const trough = rows.reduce((b, r) => (r.mean < b.mean ? r : b), rows[0]);
  const peakDev = ((peak.mean - overall) / overall) * 100;
  const troughDev = ((trough.mean - overall) / overall) * 100;

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{TITLE}</div>
          <div className="card-sub">Sundays are 18 percent quieter than the typical day. The weekly rhythm is consistent across the training period.</div>
        </div>
      </div>
      <div className="card-body">
        <BarChart
          data={rows.map((r) => r.mean)}
          labels={rows.map((r) => r.label)}
          color="#1e6091"
          height={220}
          valueFmt={(v) => formatNum(v, { decimals: 0 })}
        />
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef0f3', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
            <span><strong style={{ color: '#0d9488' }}>{peak.label}</strong> busiest</span>
            <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 700 }}>{peak.mean.toFixed(0)} <span style={{ color: '#16a34a' }}>(+{peakDev.toFixed(1)}%)</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
            <span><strong style={{ color: '#dc2626' }}>{trough.label}</strong> quietest</span>
            <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 700 }}>{trough.mean.toFixed(0)} <span style={{ color: '#dc2626' }}>({troughDev.toFixed(1)}%)</span></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
            <span>Overall mean</span>
            <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 700 }}>{overall.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturedRegimeDonut({ data, loading, err }) {
  const TITLE = '2025 brings 18 percent more arrivals than the 2022 to 2024 baseline';
  if (err)     return <ChartCard title={TITLE} err={err} />;
  if (loading) return <ChartCard title={TITLE} loading />;
  if (!data?.boxes) return <ChartCard title={TITLE} subtitle="Requires G1 with regime labels" />;

  const COLORS = { pre: '#94a3b8', during: '#dc2626', post: '#0d9488' };
  const slices = ['pre', 'during', 'post']
    .filter((k) => data.boxes[k]?.n)
    .map((k) => ({
      label: k === 'pre' ? 'Pre-COVID' : k === 'during' ? 'During COVID' : 'Post-COVID',
      value: data.boxes[k].n, mean: data.boxes[k].mean, color: COLORS[k],
    }));
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{TITLE}</div>
          <div className="card-sub">The 2025 daily mean is 69 patients against 58 for the training period; the regime shift is documented and persistent.</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <DonutWithCenter slices={slices} size={190} thickness={30} centerHeadline={total.toLocaleString()} centerSub="Days" />
        <div style={{ display: 'flex', width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' }}>
          {slices.map((s) => <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />)}
        </div>
        <ValueLegend items={slices.map((s) => ({ label: s.label, color: s.color, value: s.value, sub: `mean ${formatNum(s.mean, { decimals: 1 })}/day` }))} />
      </div>
    </div>
  );
}

function DepartmentMixCard({ data, loading, err }) {
  const TITLE = 'Medicine drives nearly three quarters of arrivals';
  if (err)     return <ChartCard title={TITLE} err={err} />;
  if (loading) return <ChartCard title={TITLE} loading />;
  if (!data?.specialties) return <ChartCard title={TITLE} subtitle="Requires G3" />;

  const COLORS = ['#1e6091', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#475569'];
  const totals = data.totals || {};
  const slices = data.specialties.map((label, i) => ({ label, value: totals[label] || 0, color: COLORS[i % COLORS.length] })).sort((a, b) => b.value - a.value);
  const totalAll = slices.reduce((s, x) => s + x.value, 0) || 1;
  const top = slices[0];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{TITLE}</div>
          <div className="card-sub">Medicine 73 percent, Orthopaedics 17 percent. The three low-volume specialties (Surgery, Paediatrics, Gynaecology) together contribute 8 percent.</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <DonutWithCenter slices={slices} size={190} thickness={30} centerHeadline={`${Math.round((top.value / totalAll) * 100)}%`} centerSub={top.label} />
        <ValueLegend items={slices.map((s) => {
          const pct = (s.value / totalAll) * 100;
          return { label: s.label, color: s.color, value: pct >= 1 ? `${Math.round(pct)}%` : '<1%', sub: s.value.toLocaleString() };
        })} />
      </div>
    </div>
  );
}

function WeekendEffectCard({ findings }) {
  const TITLE = 'Surgery rises on weekends while every other specialty falls';
  const f2 = findings.find((f) => f.code === 'F2');
  if (!f2 || !f2.detail?.rows) return <ChartCard title={TITLE} subtitle="Awaiting G3" />;
  const rows = f2.detail.rows.map((r) => ({ category: r.category, pct_deviation: r.pct_deviation }));
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{TITLE}</div>
          <div className="card-sub">Surgery uniquely sees a positive weekend shift; Medicine, Orthopaedics, Paediatrics, and Gynaecology all see fewer patients on Saturdays and Sundays.</div>
        </div>
      </div>
      <div className="card-body">
        <RankedBars rows={rows} highlightThreshold={20} height={Math.max(220, rows.length * 28)} />
      </div>
    </div>
  );
}

function KeyFindingsCard({ findings, onJump }) {
  const ROWS = [
    { finding: 'Average day is 58 patients, busy day is 80 or more', source: 'How demand behaves', sectionId: 'demand',      action: 'Roster against the busy-day target' },
    { finding: 'Day and Evening absorb 41 percent each, Night absorbs 18 percent', source: 'Within the day', sectionId: 'hours', action: 'Roster Day and Evening at parity; Night at half' },
    { finding: '12 calendar events shift daily volume materially', source: 'How demand behaves', sectionId: 'demand',         action: 'Use the calendar effects as procurement-cycle adjustment factors' },
    { finding: 'Surgery rises on weekends; every other specialty falls', source: 'By department', sectionId: 'departments',   action: 'Move the Surgery on-call rota to weekends' },
    { finding: '2025 brings 18 percent more arrivals than 2022 to 2024', source: 'Critical events', sectionId: 'critical',    action: 'Re-anchor baselines to 2022 to 2024 and absorb the shift' },
  ];
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>Five validated findings</div>
          <div className="card-sub">Every finding traces to a section of the EDA. Click any item to jump to its tab.</div>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '70%' }}>Finding</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={i} onClick={() => onJump && onJump(r.sectionId)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600, color: '#0f172a' }}>{r.finding}</td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#1e6091', fontWeight: 600 }}>
                    {r.source}<Icon name="arrow" size={12} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// DELETE the old WhyThisMatters function — replaced by KeyFindingsCard + the closing ActionPanel.
