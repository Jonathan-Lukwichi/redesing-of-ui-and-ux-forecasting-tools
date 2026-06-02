import { useEffect, useMemo, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import {
  LineChart, BarChart, Heatmap,
  StemPlot, StackedArea, ScatterPlot, DivergingMatrix,
  HeroStat, ActionPanel, RankedBars, MonthlyIndexBars, DonutWithCenter,
  KPICard, ProgressRing, ValueLegend,
  formatNum, formatPct, categoryToken, SERIF,
} from '../components/Charts';
import { api } from '../api/client';


const TABS = [
  { id: 'headlines',  label: 'Headlines' },
  { id: 'quality',    label: 'Data health' },
  { id: 'demand',     label: 'How demand behaves' },
  { id: 'departments',label: 'By department' },
  { id: 'critical',   label: 'Critical events' },
  { id: 'hours',      label: 'Within the day' },
  { id: 'drivers',    label: 'What drives demand' },
];

const SECTION_REQUIRES = {
  headlines:   [],          // headlines view needs nothing — uses whatever's available
  quality:     ['g1'],
  demand:      ['g1'],
  departments: ['g3'],
  critical:    ['g3'],
  hours:       ['g2'],
  drivers:     ['g1'],
};


export default function ExploreData({ onNavigate }) {
  const [groups, setGroups] = useState(null);
  const [section, setSection] = useState('headlines');

  useEffect(() => {
    const ctrl = new AbortController();
    api.prepare.groups(ctrl.signal).then(setGroups).catch(() => {});
    return () => ctrl.abort();
  }, []);

  const builtIds = useMemo(
    () => new Set(groups?.items.filter((it) => it.built).map((it) => it.spec.id) || []),
    [groups],
  );
  const requirements = SECTION_REQUIRES[section] || [];
  const missingGroups = requirements.filter((g) => !builtIds.has(g));
  const noGroupsBuilt = groups && builtIds.size === 0;

  return (
    <div className="content">
      <PageHero
        kicker="Data · Explore"
        title="Explore Data"
        sub="Seven validated findings, told as a story · every number is auditable and every finding has an operational action"
        image="/images/explore-bg.jpg"
        actions={
          <span className="tag tag-success" style={{ fontSize: 11 }}>
            <span className="dot" /> {groups ? `${builtIds.size}/4 groups merged` : 'Loading…'}
          </span>
        }
      />

      {noGroupsBuilt ? (
        <EmptyAnalyses onGoToPrepare={() => onNavigate && onNavigate('prepare')} />
      ) : (
        <>
          <div className="tabs">
            {TABS.map((s) => (
              <div
                key={s.id}
                className={'tab' + (section === s.id ? ' active' : '')}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </div>
            ))}
          </div>

          {missingGroups.length > 0 && section !== 'headlines' ? (
            <RequiresMerge missing={missingGroups} onGoToPrepare={() => onNavigate && onNavigate('prepare')} />
          ) : (
            <SectionView section={section} jumpTo={setSection} />
          )}
        </>
      )}
    </div>
  );
}


// ---- empty + warning states ------------------------------------------------

function EmptyAnalyses({ onGoToPrepare }) {
  return (
    <div className="card" style={{
      padding: 32, textAlign: 'center', border: '1.5px dashed #cbd5e1', background: '#fafbfc',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12, background: '#eef2f6', color: '#94a3b8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="chart" size={26} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>No analyses to show yet</div>
      <div style={{ fontSize: 13, color: '#64748b', maxWidth: 560, lineHeight: 1.5 }}>
        Explore reads from the merged analysis groups. Build at least one group on the
        <strong> Prepare </strong> page first.
      </div>
      {onGoToPrepare && (
        <button className="btn btn-primary" onClick={onGoToPrepare} style={{ marginTop: 6 }}>
          <Icon name="play" size={14} /> Go to Prepare
        </button>
      )}
    </div>
  );
}

function RequiresMerge({ missing, onGoToPrepare }) {
  return (
    <div className="card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
      <div className="card-body" style={{ color: '#78350f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>This chapter needs {missing.join(', ').toUpperCase()}.</strong>{' '}
          Merge {missing.length === 1 ? 'it' : 'them'} on the Prepare page first.
        </div>
        {onGoToPrepare && (
          <button className="btn btn-sm" onClick={onGoToPrepare}>
            <Icon name="play" size={12} /> Go to Prepare
          </button>
        )}
      </div>
    </div>
  );
}


// ---- section dispatch ------------------------------------------------------

function SectionView({ section, jumpTo }) {
  if (section === 'headlines')  return <HeadlinesSection jumpTo={jumpTo} />;
  if (section === 'quality')    return <QualitySection />;
  if (section === 'demand')     return <DemandSection />;
  if (section === 'departments')return <DepartmentsSection />;
  if (section === 'critical')   return <CriticalSection />;
  if (section === 'hours')      return <HoursSection />;
  if (section === 'drivers')    return <DriversSection />;
  return null;
}


function useAnalysis(fetcher, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetcher()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [data, error];
}


// ---- Headlines (NEW default) -----------------------------------------------

const SECTION_FROM_CODE = {
  quality:     'quality',
  demand:      'demand',
  departments: 'departments',
  critical:    'critical',
  hours:       'hours',
  drivers:     'drivers',
};

function HeadlinesSection({ jumpTo }) {
  const [metrics, mErr]   = useAnalysis(() => api.explore.metrics());
  const [findings, fErr]  = useAnalysis(() => api.explore.findings());
  const [profile, pErr]   = useAnalysis(() => api.explore.layer2HourlyProfile('g2'));
  const [regimes, rErr]   = useAnalysis(() => api.explore.covidRegimes('g1'));
  const [mix, mixErr]     = useAnalysis(() => api.explore.task2SpecialtyMix('g3'));

  if (mErr) return <ErrorBanner msg={mErr} />;
  if (!metrics) return <div style={{ padding: 24, color: '#64748b' }}>Computing dashboard…</div>;

  const kpis = metrics.metrics || [];
  const fList = findings?.findings || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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

      {/* ---- Featured: hourly arrival rhythm + COVID regime donut ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <FeaturedHourlyLines data={profile} loading={!profile && !pErr} err={pErr} />
        <FeaturedRegimeDonut data={regimes} loading={!regimes && !rErr} err={rErr} />
      </div>

      {/* ---- Secondary row: three insight cards ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <DepartmentMixCard data={mix} loading={!mix && !mixErr} err={mixErr} />
        <WeekendEffectCard findings={fList} />
        <KeyFindingsCard findings={fList} onJump={jumpTo} />
      </div>

      {/* ---- Optional: tucked-away action drawer ---- */}
      {fList.length > 0 && <WhyThisMatters findings={fList} />}
    </div>
  );
}

// ---- Headlines sub-cards ---------------------------------------------------

function FeaturedHourlyLines({ data, loading, err }) {
  if (err)     return <ChartCard title="Hospital activity through the day" err={err} />;
  if (loading) return <ChartCard title="Hospital activity through the day" loading />;
  if (!data?.dow_curves) return <ChartCard title="Hospital activity through the day" subtitle="Requires hourly group G2" />;

  const curves = data.dow_curves;
  const weekdayKeys = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const weekendKeys = ['Sat', 'Sun'];

  const mean = (keys, h) => {
    const vals = keys.map((k) => (curves[k]?.[h] ?? null)).filter((v) => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  };

  const weekdayCurve = Array.from({ length: 24 }, (_, h) => mean(weekdayKeys, h));
  const weekendCurve = Array.from({ length: 24 }, (_, h) => mean(weekendKeys, h));

  const peakHour   = weekdayCurve.indexOf(Math.max(...weekdayCurve));
  const peakValue  = weekdayCurve[peakHour];
  const troughHour = weekdayCurve.indexOf(Math.min(...weekdayCurve));
  const troughValue = weekdayCurve[troughHour];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>
            Hospital activity through the day
          </div>
          <div className="card-sub">Mean arrivals per hour · weekday vs weekend</div>
        </div>
      </div>
      <div className="card-body">
        {/* Top-row hero stats — clear of the chart area, no overlap. */}
        <div style={{
          display: 'flex', gap: 32, marginBottom: 12, paddingBottom: 12,
          borderBottom: '1px solid #eef0f3',
        }}>
          <HeroStatInline
            kicker="Peak hour"
            value={`${peakHour.toString().padStart(2, '0')}:00`}
            sub={`${peakValue.toFixed(1)} arrivals/hour · weekday`}
            color="#0d9488"
          />
          <HeroStatInline
            kicker="Trough"
            value={`${troughHour.toString().padStart(2, '0')}:00`}
            sub={`${troughValue.toFixed(1)} arrivals/hour`}
            color="#64748b"
          />
          <HeroStatInline
            kicker="Peak-to-trough"
            value={`×${data.peak_to_trough_ratio ?? '—'}`}
            sub="weekday amplitude"
            color="#1e6091"
          />
        </div>
        <LineChart
          series={[
            { data: weekdayCurve, color: '#1e6091' },
            { data: weekendCurve, color: '#dc2626' },
          ]}
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

function HeroStatInline({ kicker, value, sub, color = '#0f172a' }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>
        {kicker}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1,
        marginTop: 2, fontFamily: SERIF, fontVariantNumeric: 'tabular-nums',
      }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function FeaturedRegimeDonut({ data, loading, err }) {
  if (err)     return <ChartCard title="COVID regime split" err={err} />;
  if (loading) return <ChartCard title="COVID regime split" loading />;
  if (!data?.boxes) return <ChartCard title="COVID regime split" subtitle="Requires G1 with regime labels" />;

  const COLORS = { pre: '#94a3b8', during: '#dc2626', post: '#0d9488' };
  const slices = ['pre', 'during', 'post']
    .filter((k) => data.boxes[k]?.n)
    .map((k) => ({
      label: k === 'pre' ? 'Pre-COVID' : k === 'during' ? 'During COVID' : 'Post-COVID',
      value: data.boxes[k].n,
      mean: data.boxes[k].mean,
      color: COLORS[k],
    }));
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>COVID regime split</div>
          <div className="card-sub">Days per regime + mean arrivals each</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <DonutWithCenter
          slices={slices}
          size={210}
          thickness={32}
          centerHeadline={total.toLocaleString()}
          centerSub="Days"
        />
        {/* 100%-stacked share strip — frames how much of the dataset is each regime */}
        <div style={{ display: 'flex', width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' }}>
          {slices.map((s) => (
            <div key={s.label} style={{
              width: `${(s.value / total) * 100}%`, background: s.color,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: '#64748b' }}>
          {slices.map((s) => (
            <span key={s.label}><strong style={{ color: '#0f172a' }}>{Math.round((s.value / total) * 100)}%</strong> {s.label.split('-')[0]}</span>
          ))}
        </div>
        <ValueLegend
          items={slices.map((s) => ({
            label: s.label,
            color: s.color,
            value: s.value,
            sub: `mean ${formatNum(s.mean, { decimals: 1 })}/day`,
          }))}
        />
      </div>
    </div>
  );
}

function DepartmentMixCard({ data, loading, err }) {
  if (err)     return <ChartCard title="Department mix" err={err} />;
  if (loading) return <ChartCard title="Department mix" loading />;
  if (!data?.specialties) return <ChartCard title="Department mix" subtitle="Requires G3" />;

  const COLORS = ['#1e6091', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#475569'];
  const totals = data.totals || {};
  const slices = data.specialties.map((label, i) => ({
    label, value: totals[label] || 0, color: COLORS[i % COLORS.length],
  })).sort((a, b) => b.value - a.value);
  const totalAll = slices.reduce((s, x) => s + x.value, 0) || 1;
  const top = slices[0];

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>Department mix</div>
          <div className="card-sub">Share of total arrivals — all {slices.length} specialties</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <DonutWithCenter
          slices={slices}
          size={210}
          thickness={32}
          centerHeadline={`${Math.round((top.value / totalAll) * 100)}%`}
          centerSub={top.label}
        />
        <ValueLegend
          items={slices.map((s) => {
            const pct = (s.value / totalAll) * 100;
            return {
              label: s.label,
              color: s.color,
              value: pct >= 1 ? `${Math.round(pct)}%` : `<1%`,
              sub: s.value.toLocaleString(),
            };
          })}
        />
      </div>
    </div>
  );
}

function WeekendEffectCard({ findings }) {
  const f2 = findings.find((f) => f.code === 'F2');
  if (!f2 || !f2.detail?.rows) return <ChartCard title="Weekend effect by department" subtitle="Awaiting G3" />;
  const rows = f2.detail.rows.map((r) => ({ category: r.category, pct_deviation: r.pct_deviation }));
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Weekend effect by department</div>
          <div className="card-sub">% change vs weekday baseline</div>
        </div>
      </div>
      <div className="card-body">
        <RankedBars rows={rows} highlightThreshold={20} height={Math.max(220, rows.length * 28)} />
      </div>
    </div>
  );
}

function KeyFindingsCard({ findings, onJump }) {
  if (!findings.length) return null;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Operational signals</div>
          <div className="card-sub">{findings.length} validated findings · click for the deep-dive</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {findings.map((f) => {
          const tok = categoryToken(f.category);
          return (
            <div
              key={f.id}
              onClick={() => onJump && onJump(SECTION_FROM_CODE[f.section] || 'demand')}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                background: '#fafbfc', border: '1px solid #eef0f3', borderLeft: `3px solid ${tok.color}`,
                borderRadius: 6, cursor: 'pointer',
              }}>
              <div style={{
                fontSize: 16, fontWeight: 700, color: tok.color, minWidth: 70,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.4px',
              }}>{f.headline}</div>
              <div style={{ flex: 1, fontSize: 12, color: '#334155', lineHeight: 1.4 }}>{f.title}</div>
              <Icon name="arrow" size={14} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhyThisMatters({ findings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div
        className="card-header"
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div>
          <div className="card-title">Why this matters</div>
          <div className="card-sub">Mechanism + recommended action for every signal</div>
        </div>
        <span style={{ fontSize: 12, color: '#64748b' }}>{open ? '−' : '+'}</span>
      </div>
      {open && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {findings.map((f) => {
            const tok = categoryToken(f.category);
            return (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 14, paddingBottom: 12, borderBottom: '1px solid #eef0f3' }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: tok.color, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    {f.code}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: tok.color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {f.headline}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, lineHeight: 1.5 }}>{f.summary}</div>
                  <ActionPanel mechanism={f.mechanism} action={f.action} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ---- Data Health (was Quality) ---------------------------------------------

function QualitySection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 1"
        title="Every number you see is auditable"
        sub="The data passes four independent checks before any claim is made"
      />
      <MissingnessCard />
      <OutlierCard />
      <CovidRegimeCard />
    </>
  );
}

function MissingnessCard() {
  const [data, err] = useAnalysis(() => api.explore.missingness('g1'));
  return (
    <ChartCard
      title="Completeness"
      subtitle="Top columns by % missing — the audit foundation"
      err={err} loading={!data && !err}
    >
      {data && (data.columns_with_missing === 0 ? (
        <div style={{ color: '#16a34a', fontSize: 14, fontWeight: 500 }}>
          ✓ All {data.columns_total} columns have full coverage across {data.rows.toLocaleString()} rows.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.top.slice(0, 12).map((r) => (
            <div key={r.column}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span className="mono" style={{ color: '#334155' }}>{r.column}</span>
                <span className="tnum" style={{ color: r.pct > 5 ? '#dc2626' : r.pct > 1 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                  {r.pct}% ({r.missing.toLocaleString()})
                </span>
              </div>
              <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, r.pct * 2) + '%', background: r.pct > 5 ? '#dc2626' : r.pct > 1 ? '#d97706' : '#94a3b8' }} /></div>
            </div>
          ))}
        </div>
      ))}
    </ChartCard>
  );
}

function OutlierCard() {
  const [data, err] = useAnalysis(() => api.explore.outliers('g1'));
  if (!data) return <ChartCard title="Outlier days" err={err} loading subtitle="Classified by IQR rule" />;
  const xLabels = data.points?.length
    ? [data.points[0].date, data.points[Math.floor(data.points.length / 2)].date, data.points[data.points.length - 1].date]
    : [];
  return (
    <SplitCard
      title="Outlier days"
      subtitle="Daily arrivals classified by IQR — colour shows category"
      hero={
        <HeroStat
          value={(data.summary?.peak || 0) + (data.summary?.high || 0)}
          label="High and peak days"
          sub={`${data.summary?.zero || 0} zero-arrival days flagged as data-capture lapses · ${data.summary?.normal || 0} normal days`}
          category="watch"
          size="md"
        />
      }
      chart={
        <>
          <ScatterPlot points={data.points} xLabels={xLabels} height={260} />
          <Legend items={[
            { label: 'Normal', color: '#1e6091' },
            { label: 'High',   color: '#d97706' },
            { label: 'Peak',   color: '#dc2626' },
            { label: 'Zero',   color: '#94a3b8' },
          ]} />
        </>
      }
    />
  );
}

function CovidRegimeCard() {
  const [data, err] = useAnalysis(() => api.explore.covidRegimes('g1'));
  if (!data) return <ChartCard title="COVID regime split" subtitle="" err={err} loading />;
  const order = ['pre', 'during', 'post'];
  const boxes = order.map((k) => ({ key: k, ...(data.boxes?.[k] || {}) }));
  const pre = data.boxes?.pre?.mean, post = data.boxes?.post?.mean;
  const pct = (pre && post) ? Math.round((post - pre) / pre * 1000) / 10 : null;
  return (
    <SplitCard
      title="COVID regime split"
      subtitle="Distribution of daily arrivals in each regime"
      hero={
        <HeroStat
          value={pct != null ? `${pct >= 0 ? '+' : ''}${pct}%` : '—'}
          label="Post vs pre-COVID shift"
          sub={`Post-COVID averages ${Math.round(post || 0)} arrivals/day, pre-COVID ${Math.round(pre || 0)}. The shift is permanent.`}
          category={pct && pct > 5 ? 'risk' : 'watch'}
          size="lg"
        />
      }
      chart={
        <>
          <BarChart
            data={boxes.map((b) => b.mean || 0)}
            labels={['Pre-COVID', 'During', 'Post-COVID']}
            color="#0d9488"
            height={240}
            valueFmt={(v) => formatNum(v, { decimals: 1 })}
          />
          <div style={{ marginTop: 10, fontSize: 12, color: '#475569' }}>
            {order.map((k) => {
              const b = data.boxes?.[k] || {};
              if (!b.n) return null;
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span style={{ textTransform: 'capitalize' }}>{k}-COVID</span>
                  <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 600 }}>
                    median {Math.round(b.median)} · mean {Math.round(b.mean)} · n={b.n.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      }
    />
  );
}


// ---- How Demand Behaves ----------------------------------------------------

function DemandSection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 2"
        title="How demand behaves over time"
        sub="The shape, the trend, the seasonality, the lags"
      />
      <DistributionCard />
      <StlCard />
      <AcfPacfCard />
      <CalendarEffectsCard />
    </>
  );
}

function DistributionCard() {
  const [data, err] = useAnalysis(() => api.explore.task1Distribution('g1'));
  if (!data || !data.histogram) return <ChartCard title="The shape of demand" err={err} loading subtitle="Histogram of daily arrivals" />;
  const { bin_centers, counts } = data.histogram;
  const labels = bin_centers.map((c, i) => (i % 5 === 0 ? Math.round(c).toString() : ''));
  const fitSeries = (data.fits || []).map((f, i) => ({
    data: f.pdf, color: ['#0d9488', '#1e6091', '#d97706'][i % 3],
  }));
  return (
    <SplitCard
      title="The shape of demand"
      subtitle="Histogram of daily arrivals with three candidate distributions"
      hero={
        <HeroStat
          value={`${data.stats.mean}/day`}
          label="Mean daily arrivals"
          sub={`Variance-to-mean ratio ${data.stats.variance_to_mean_ratio ?? '—'} · skew ${data.stats.skewness} · sd ${data.stats.std}`}
          category="stable"
          size="md"
        />
      }
      chart={
        <>
          <BarChart data={counts} labels={labels} height={200} color="#cbd5e1" valueFmt={() => ''} />
          {fitSeries.length > 0 && (
            <div style={{ marginTop: -200, height: 200, position: 'relative' }}>
              <LineChart series={fitSeries} height={200} />
            </div>
          )}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {(data.fits || []).map((f, i) => (
              <span key={f.name} style={{ color: ['#0d9488', '#1e6091', '#d97706'][i % 3], fontWeight: 600 }}>
                {f.name} · AIC {Math.round(f.aic).toLocaleString()}
              </span>
            ))}
          </div>
        </>
      }
    />
  );
}

function StlCard() {
  const [data, err] = useAnalysis(() => api.explore.task1Stl('g1'));
  if (!data || !data.observed) return <ChartCard title="Trend, seasonality, residual" subtitle="" err={err} loading />;
  const xLabels = [data.dates[0], data.dates[Math.floor(data.dates.length / 2)], data.dates[data.dates.length - 1]];
  return (
    <ChartCard title="Trend, seasonality, residual" subtitle={`Weekly seasonality decomposed across ${data.observed.length.toLocaleString()} points`} err={err}>
      <SubChart title="Observed">
        <LineChart series={[{ data: data.observed, color: '#475569' }]} xLabels={xLabels} height={110} />
      </SubChart>
      <SubChart title="Trend">
        <LineChart series={[{ data: data.trend, color: '#1e6091' }]} xLabels={xLabels} height={110} />
      </SubChart>
      <SubChart title="Seasonal (weekly)">
        <LineChart series={[{ data: data.seasonal, color: '#0d9488' }]} xLabels={xLabels} height={110} />
      </SubChart>
      <SubChart title="Residual">
        <LineChart series={[{ data: data.resid, color: '#94a3b8' }]} xLabels={xLabels} height={110} />
      </SubChart>
    </ChartCard>
  );
}

function AcfPacfCard() {
  const [data, err] = useAnalysis(() => api.explore.task1AcfPacf('g1'));
  if (!data || !data.acf) return <ChartCard title="Autocorrelation" subtitle="" err={err} loading />;
  const labels = data.lags.map((l) => (l % 5 === 0 ? String(l) : ''));
  return (
    <ChartCard title="Autocorrelation (ACF / PACF)" subtitle={`Lags 0–${data.nlags} · 95% confidence band ±${data.confidence_band}`} err={err}>
      <SubChart title="ACF">
        <StemPlot data={data.acf} confidenceBand={data.confidence_band} labels={labels} height={150} color="#1e6091" />
      </SubChart>
      <SubChart title="PACF">
        <StemPlot data={data.pacf} confidenceBand={data.confidence_band} labels={labels} height={150} color="#0d9488" />
      </SubChart>
    </ChartCard>
  );
}

function CalendarEffectsCard() {
  const [data, err] = useAnalysis(() => api.explore.task1CalendarEffects('g1'));
  if (!data) return <ChartCard title="Calendar effects" subtitle="" err={err} loading />;
  return (
    <ChartCard title="Calendar effects" subtitle="Day-of-week and month variation in daily arrivals" err={err}>
      {data.day_of_week && (
        <SubChart title="By day of week — mean arrivals">
          <BarChart
            data={data.day_of_week.map((r) => r.mean || 0)}
            labels={data.day_of_week_labels}
            color="#1e6091"
            height={200}
            valueFmt={(v) => formatNum(v, { decimals: 0 })}
          />
        </SubChart>
      )}
      {data.month && (
        <SubChart title="By month — index vs annual mean">
          <MonthlyIndexBars
            rows={data.month.map((r, i) => ({
              label: data.month_labels[i],
              mean: r.mean,
              index: r.mean ? (r.mean / (data.day_of_week.reduce((s, x) => s + (x.mean || 0), 0) / data.day_of_week.length)) * 100 : null,
            }))}
            height={220}
          />
        </SubChart>
      )}
      {data.weekend_vs_weekday && (
        <div style={{ marginTop: 8, padding: 10, background: '#fafbfc', borderRadius: 6, fontSize: 12, color: '#475569' }}>
          Weekend vs weekday mean: <strong style={{ color: '#0f172a' }}>{data.weekend_vs_weekday.weekend_mean} vs {data.weekend_vs_weekday.weekday_mean}</strong>
          {data.weekend_vs_weekday.pct_deviation != null && (
            <> · deviation {data.weekend_vs_weekday.pct_deviation > 0 ? '+' : ''}{data.weekend_vs_weekday.pct_deviation}%</>
          )}
          {data.holiday_vs_regular && (
            <> · Holiday vs regular: <strong style={{ color: '#0f172a' }}>{data.holiday_vs_regular.holiday_mean} vs {data.holiday_vs_regular.regular_mean}</strong> ({data.holiday_vs_regular.pct_deviation > 0 ? '+' : ''}{data.holiday_vs_regular.pct_deviation}%)</>
          )}
        </div>
      )}
    </ChartCard>
  );
}


// ---- By Department ---------------------------------------------------------

function DepartmentsSection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 3"
        title="The seven departments behave differently"
        sub="Volume, weekend behaviour, and how independently they move"
      />
      <SpecialtyMixCard />
      <SpecialtyWeekendCard />
      <SpecialtyCorrCard />
    </>
  );
}

function SpecialtyMixCard() {
  const [data, err] = useAnalysis(() => api.explore.task2SpecialtyMix('g3'));
  if (!data || !data.specialties) return <ChartCard title="Specialty mix over time" subtitle="" err={err} loading />;
  const COLORS = ['#1e6091', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#475569'];
  const totals = data.totals || {};
  const totalAll = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  const slices = data.specialties.map((label, i) => ({
    label, value: totals[label] || 0, color: COLORS[i % COLORS.length],
  }));
  const top = [...slices].sort((a, b) => b.value - a.value)[0];
  return (
    <SplitCard
      title="Specialty composition"
      subtitle="Share of total arrivals across the seven specialties"
      hero={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <DonutWithCenter
            slices={slices}
            size={180}
            thickness={28}
            centerHeadline={`${Math.round((top.value / totalAll) * 100)}%`}
            centerSub={top.label}
          />
          <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>
            {top.label} dominates · {slices.length} specialties total
          </div>
        </div>
      }
      chart={
        <>
          <StackedArea series={data.series} dates={data.dates} colors={slices.map((s) => s.color)} height={240} />
          <Legend items={slices.map((s) => ({
            label: s.label, color: s.color,
            suffix: ` (${s.value.toLocaleString()})`,
          }))} />
        </>
      }
    />
  );
}

function SpecialtyWeekendCard() {
  const [data, err] = useAnalysis(() => api.explore.findings());
  const f2 = data?.findings?.find((f) => f.code === 'F2');
  if (err) return <ErrorBanner msg={err} />;
  if (!data) return <ChartCard title="Weekend behaviour by specialty" subtitle="" loading />;
  if (!f2 || !f2.detail?.rows) {
    return <ChartCard title="Weekend behaviour by specialty" subtitle="Requires G3 with a weekend flag" />;
  }
  const rows = f2.detail.rows.map((r) => ({ category: r.category, pct_deviation: r.pct_deviation }));
  return (
    <SplitCard
      title="Weekend behaviour by specialty"
      subtitle="Percentage change vs weekday baseline for each specialty"
      hero={
        <HeroStat
          value={f2.headline}
          label={f2.title}
          sub={f2.summary}
          category={f2.category}
          size="lg"
        />
      }
      chart={<RankedBars rows={rows} highlightThreshold={20} height={Math.max(220, rows.length * 32)} />}
    >
      <ActionPanel mechanism={f2.mechanism} action={f2.action} />
    </SplitCard>
  );
}

function SpecialtyCorrCard() {
  const [data, err] = useAnalysis(() => api.explore.task2SpecialtyCorr('g3'));
  if (!data || !data.matrix) return <ChartCard title="Specialty correlation" subtitle="" err={err} loading />;
  return (
    <ChartCard title="Are specialties correlated?" subtitle="Pearson correlation between specialty daily counts" err={err}>
      <DivergingMatrix rows={data.labels} columns={data.labels} data={data.matrix} max={1} height={300} />
    </ChartCard>
  );
}


// ---- Critical Events -------------------------------------------------------

function CriticalSection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 4"
        title="Surge days for critical events"
        sub="Days above the 90th percentile for each critical event category"
      />
      <CriticalCard />
    </>
  );
}

function CriticalCard() {
  const [data, err] = useAnalysis(() => api.explore.task3ClassBalance('g3'));
  if (!data || !data.categories) return <ChartCard title="Critical-event class balance" subtitle="" err={err} loading />;
  const labels = data.categories.map((c) => c.category);
  const rates  = data.categories.map((c) => c.surge_rate);
  const top = data.categories[0];
  return (
    <SplitCard
      title="Critical-event class balance"
      subtitle={`Surge defined as daily total > P${data.percentile} · expected rate ${data.expected_rate_pct}%`}
      hero={
        <HeroStat
          value={`${top.surge_rate}%`}
          label={`${top.category} has the highest surge rate`}
          sub={`${top.surge_days.toLocaleString()} surge days out of ${top.total_days.toLocaleString()} · threshold > ${top.threshold} events/day`}
          category={top.surge_rate > data.expected_rate_pct * 1.2 ? 'risk' : 'watch'}
          size="lg"
        />
      }
      chart={
        <>
          <BarChart data={rates} labels={labels} height={220} color="#dc2626" valueFmt={(v) => v + '%'} />
          <table className="tbl" style={{ marginTop: 12 }}>
            <thead><tr>
              <th>Category</th><th className="num">Surge rate</th><th className="num">Surge days</th>
              <th className="num">Threshold</th><th className="num">Mean / max</th>
            </tr></thead>
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td className="num mono" style={{ color: c.surge_rate > data.expected_rate_pct * 1.5 ? '#dc2626' : '#0f172a', fontWeight: 600 }}>
                    {c.surge_rate}%
                  </td>
                  <td className="num mono">{c.surge_days.toLocaleString()} / {c.total_days.toLocaleString()}</td>
                  <td className="num mono">{c.threshold}</td>
                  <td className="num mono">{c.mean} / {c.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      }
    />
  );
}


// ---- Within the Day --------------------------------------------------------

function HoursSection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 5"
        title="What a day in the ED looks like"
        sub="The hourly profile, the shift split, and the weekly heatmap"
      />
      <ShiftSplitCard />
      <HourlyProfileCard />
    </>
  );
}

function ShiftSplitCard() {
  const [data, err] = useAnalysis(() => api.explore.findings());
  const f4 = data?.findings?.find((f) => f.code === 'F4');
  if (err) return <ErrorBanner msg={err} />;
  if (!data) return <ChartCard title="Day / Evening / Night split" subtitle="" loading />;
  if (!f4 || !f4.detail?.buckets) {
    return <ChartCard title="Day / Evening / Night split" subtitle="Requires hourly group G2" />;
  }
  const buckets = f4.detail.buckets;
  const COLORS = ['#0d9488', '#1e6091', '#0f1729'];
  const slices = buckets.map((b, i) => ({ label: b.label, value: b.share_pct, color: COLORS[i] }));
  return (
    <SplitCard
      title="Day / Evening / Night split"
      subtitle="Share of total arrivals by 8-hour shift"
      hero={
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <DonutWithCenter
            slices={slices} size={180} thickness={30}
            centerHeadline={f4.headline}
            centerSub="Day / Eve / Night"
          />
          <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', lineHeight: 1.5, maxWidth: 240 }}>
            {f4.summary}
          </div>
        </div>
      }
      chart={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {buckets.map((b, i) => (
            <div key={b.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{b.label}</span>
                <span className="mono tnum" style={{ color: COLORS[i], fontWeight: 700 }}>{b.share_pct}%</span>
              </div>
              <div className="bar"><div className="bar-fill" style={{ width: b.share_pct + '%', background: COLORS[i] }} /></div>
            </div>
          ))}
        </div>
      }
    >
      <ActionPanel mechanism={f4.mechanism} action={f4.action} />
    </SplitCard>
  );
}

function HourlyProfileCard() {
  const [data, err] = useAnalysis(() => api.explore.layer2HourlyProfile('g2'));
  if (!data || !data.rows) return <ChartCard title="Hourly profile" subtitle="" err={err} loading />;
  const means = data.rows.map((r) => r.mean);
  const upper = data.rows.map((r) => r.ci_high);
  const lower = data.rows.map((r) => r.ci_low);
  const labels = data.rows.map((r) => (r.hour % 3 === 0 ? `${r.hour}h` : ''));
  return (
    <>
      <ChartCard
        title="Aggregate hourly profile"
        subtitle={`Mean ± 95% CI · peak-to-trough ratio ${data.peak_to_trough_ratio ?? '—'} · n=${data.n.toLocaleString()} hours`}
        err={err}
      >
        <LineChart
          series={[{ data: means, color: '#1e6091', band: { upper, lower } }]}
          xLabels={labels.filter(Boolean)}
          height={240}
        />
      </ChartCard>
      {data.dow_curves && Object.keys(data.dow_curves).length > 0 && (
        <ChartCard title="Hour × day-of-week heatmap" subtitle="Mean arrivals per hour, per weekday" err={null}>
          <Heatmap
            data={Object.values(data.dow_curves)}
            rows={Object.keys(data.dow_curves)}
            cols={Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? `${i}h` : ''))}
            height={220}
          />
        </ChartCard>
      )}
    </>
  );
}


// ---- What Drives Demand ----------------------------------------------------

function DriversSection() {
  return (
    <>
      <StoryHeader
        kicker="Chapter 6"
        title="What pushes demand up and down"
        sub="Calendar and weather features ranked by impact"
      />
      <MonthlyIndexCard />
      <ImpactCalendarCard />
      <ImpactWeatherCard />
    </>
  );
}

function MonthlyIndexCard() {
  const [data, err] = useAnalysis(() => api.explore.findings());
  const f3 = data?.findings?.find((f) => f.code === 'F3');
  if (err) return <ErrorBanner msg={err} />;
  if (!data) return <ChartCard title="Year-end decompresses the ED" subtitle="" loading />;
  if (!f3 || !f3.detail?.rows) {
    return <ChartCard title="Year-end decompresses the ED" subtitle="Requires daily group G1 with a month column" />;
  }
  return (
    <SplitCard
      title="Monthly index vs annual mean"
      subtitle={`Annual mean baseline = 100 · annual mean ${f3.detail.annual_mean}/day`}
      hero={
        <HeroStat
          value={f3.headline}
          label={f3.title}
          sub={f3.summary}
          category={f3.category}
          size="lg"
        />
      }
      chart={<MonthlyIndexBars rows={f3.detail.rows} height={260} />}
    >
      <ActionPanel mechanism={f3.mechanism} action={f3.action} />
    </SplitCard>
  );
}

function ImpactCalendarCard() {
  const [data, err] = useAnalysis(() => api.explore.impactMatrix('g1'));
  if (!data || !data.rows) return <ChartCard title="Calendar features · % deviation" subtitle="" err={err} loading />;
  const binaryRows = data.rows.filter((r) => r.kind === 'binary');
  const rows = binaryRows
    .map((r) => ({ category: r.feature, pct_deviation: r['true']?.pct ?? 0 }))
    .sort((a, b) => Math.abs(b.pct_deviation) - Math.abs(a.pct_deviation));
  return (
    <ChartCard
      title="Calendar features · % deviation"
      subtitle="Effect on mean daily arrivals when the flag is true"
      err={err}
    >
      <RankedBars rows={rows} height={Math.max(220, rows.length * 32)} highlightThreshold={10} />
    </ChartCard>
  );
}

function ImpactWeatherCard() {
  const [data, err] = useAnalysis(() => api.explore.impactMatrix('g1'));
  if (!data || !data.rows) return <ChartCard title="Weather quartiles · % deviation" subtitle="" err={err} loading />;
  const qLevels = data.quartile_levels;
  const quartileRows = data.rows.filter((r) => r.kind === 'quartile');
  const matrix = quartileRows.map((r) => qLevels.map((lvl) => r[lvl]?.pct ?? null));
  return (
    <ChartCard
      title="Weather quartiles · % deviation"
      subtitle="Each row: a weather variable split into quartiles Q1–Q4"
      err={err}
    >
      <DivergingMatrix rows={quartileRows.map((r) => r.feature)} columns={qLevels} data={matrix} height={260} />
    </ChartCard>
  );
}


// ---- Layout primitives -----------------------------------------------------

function StoryHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 1.4 }}>{kicker}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 4, letterSpacing: '-0.4px',
        fontFamily: SERIF,
      }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, err, loading, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="card-body">
        {err
          ? <div style={{ color: '#991b1b', background: '#fef5f5', border: '1px solid #fecaca', borderRadius: 6, padding: 10, fontSize: 12 }}>{err}</div>
          : loading
            ? <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
            : children}
      </div>
    </div>
  );
}

function SplitCard({ title, subtitle, hero, chart, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {hero}
          {children}
        </div>
        <div>{chart}</div>
      </div>
    </div>
  );
}

function SubChart({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color, display: 'inline-block' }} />
          {it.label}{it.suffix || ''}
        </span>
      ))}
    </div>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div className="card" style={{ borderColor: '#dc2626', background: '#fef5f5' }}>
      <div className="card-body" style={{ color: '#991b1b', fontSize: 13 }}>{msg}</div>
    </div>
  );
}
