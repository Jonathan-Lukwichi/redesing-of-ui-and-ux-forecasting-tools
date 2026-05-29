import { useEffect, useMemo, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import {
  LineChart, BarChart, Heatmap,
  StemPlot, BoxPlot, StackedArea, ScatterPlot, DivergingMatrix,
} from '../components/Charts';
import { api } from '../api/client';

const SECTIONS = [
  { id: 'quality',    label: 'Data quality' },
  { id: 'task1',      label: 'Daily demand · Task 1' },
  { id: 'task2',      label: 'Specialty composition · Task 2' },
  { id: 'task3',      label: 'Critical events · Task 3' },
  { id: 'layer2',     label: 'Hourly profile · Layer 2' },
  { id: 'synthesis',  label: 'Impact synthesis' },
];

const SECTION_REQUIRES = {
  quality: ['g1'],
  task1: ['g1'],
  task2: ['g3'],
  task3: ['g3'],
  layer2: ['g2'],
  synthesis: ['g1'],
};

export default function ExploreData({ onNavigate }) {
  const [groups, setGroups] = useState(null);
  const [section, setSection] = useState('quality');

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
        sub="Distributions, seasonality, COVID regimes, specialty composition, surge classification, hourly profiles, and an impact-matrix synthesis"
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
            {SECTIONS.map((s) => (
              <div
                key={s.id}
                className={'tab' + (section === s.id ? ' active' : '')}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </div>
            ))}
          </div>

          {missingGroups.length > 0 ? (
            <RequiresMerge sectionId={section} missing={missingGroups} onGoToPrepare={() => onNavigate && onNavigate('prepare')} />
          ) : (
            <SectionView section={section} />
          )}
        </>
      )}
    </div>
  );
}

// ---- empty states ----------------------------------------------------------

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
        The Explore page reads from the merged analysis groups <strong>G1–G4</strong>.
        Build at least one group on the <strong>Prepare</strong> page to start running analyses here.
      </div>
      {onGoToPrepare && (
        <button className="btn btn-primary" onClick={onGoToPrepare} style={{ marginTop: 6 }}>
          <Icon name="play" size={14} /> Go to Prepare
        </button>
      )}
    </div>
  );
}

function RequiresMerge({ sectionId, missing, onGoToPrepare }) {
  return (
    <div className="card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
      <div className="card-body" style={{ color: '#78350f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>This section needs {missing.join(', ').toUpperCase()}.</strong>{' '}
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

function SectionView({ section }) {
  if (section === 'quality')   return <QualitySection />;
  if (section === 'task1')     return <Task1Section />;
  if (section === 'task2')     return <Task2Section />;
  if (section === 'task3')     return <Task3Section />;
  if (section === 'layer2')    return <Layer2Section />;
  if (section === 'synthesis') return <SynthesisSection />;
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

// ---- §5.2 Quality ----------------------------------------------------------

function QualitySection() {
  return (
    <>
      <MissingnessCard />
      <OutlierCard />
      <CovidRegimeCard />
    </>
  );
}

function MissingnessCard() {
  const [data, err] = useAnalysis(() => api.explore.missingness('g1'));
  return (
    <ChartCard title="Missingness summary" subtitle="Top columns by % missing"
      err={err} loading={!data && !err}>
      {data && (data.columns_with_missing === 0 ? (
        <div style={{ color: '#16a34a', fontSize: 14 }}>
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
  if (!data) return <ChartCard title="Outlier scatter" err={err} loading subtitle="" />;
  const xLabels = data.points.length
    ? [data.points[0].date, data.points[Math.floor(data.points.length / 2)].date, data.points[data.points.length - 1].date]
    : [];
  return (
    <ChartCard
      title="Outlier scatter"
      subtitle={`${data.summary?.normal || 0} normal · ${data.summary?.high || 0} high · ${data.summary?.peak || 0} peak · ${data.summary?.zero || 0} zero days`}
      err={err}
    >
      <ScatterPlot points={data.points} xLabels={xLabels} height={260} />
      <Legend items={[
        { label: 'Normal', color: '#1e6091' },
        { label: 'High',   color: '#d97706' },
        { label: 'Peak',   color: '#dc2626' },
        { label: 'Zero',   color: '#94a3b8' },
      ]} />
    </ChartCard>
  );
}

function CovidRegimeCard() {
  const [data, err] = useAnalysis(() => api.explore.covidRegimes('g1'));
  if (!data) return <ChartCard title="COVID regime split" subtitle="" err={err} loading />;
  const order = ['pre', 'during', 'post'];
  const boxes = order.map((k) => ({ key: k, ...(data.boxes?.[k] || {}) }));
  return (
    <ChartCard
      title="COVID regime split"
      subtitle="Distribution of daily arrivals during each regime"
      err={err}
    >
      <BoxPlot data={boxes} labels={['Pre-COVID', 'During', 'Post-COVID']} height={240} color="#0d9488" />
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
    </ChartCard>
  );
}

// ---- §5.3 Task 1 -----------------------------------------------------------

function Task1Section() {
  return (
    <>
      <DistributionCard />
      <StlCard />
      <AcfPacfCard />
      <CalendarEffectsCard />
    </>
  );
}

function DistributionCard() {
  const [data, err] = useAnalysis(() => api.explore.task1Distribution('g1'));
  if (!data || !data.histogram) return <ChartCard title="Distribution + fitted PDFs" subtitle="" err={err} loading />;
  const { bin_centers, counts } = data.histogram;
  const labels = bin_centers.map((c, i) => (i % 5 === 0 ? Math.round(c).toString() : ''));
  const fitSeries = (data.fits || []).map((f, i) => ({
    data: f.pdf, color: ['#0d9488', '#1e6091', '#d97706'][i % 3],
  }));
  return (
    <ChartCard
      title="Distribution + fitted PDFs"
      subtitle={`mean ${data.stats.mean} · sd ${data.stats.std} · skew ${data.stats.skewness} · VMR ${data.stats.variance_to_mean_ratio ?? '—'}`}
      err={err}
    >
      <BarChart data={counts} labels={labels} height={200} color="#cbd5e1" valueFmt={(v) => ''} />
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
    </ChartCard>
  );
}

function StlCard() {
  const [data, err] = useAnalysis(() => api.explore.task1Stl('g1'));
  if (!data || !data.observed) return <ChartCard title="STL decomposition" subtitle="" err={err} loading />;
  const xLabels = [data.dates[0], data.dates[Math.floor(data.dates.length / 2)], data.dates[data.dates.length - 1]];
  return (
    <ChartCard title="STL decomposition" subtitle={`weekly period · ${data.observed.length.toLocaleString()} points`} err={err}>
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
  if (!data || !data.acf) return <ChartCard title="Autocorrelation (ACF / PACF)" subtitle="" err={err} loading />;
  const labels = data.lags.map((l) => (l % 5 === 0 ? String(l) : ''));
  return (
    <ChartCard title="Autocorrelation (ACF / PACF)" subtitle={`lags 0–${data.nlags} · 95% confidence band ±${data.confidence_band}`} err={err}>
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
        <SubChart title="By day of week">
          <BoxPlot data={data.day_of_week} labels={data.day_of_week_labels} height={200} color="#1e6091" />
        </SubChart>
      )}
      {data.month && (
        <SubChart title="By month">
          <BoxPlot data={data.month} labels={data.month_labels} height={200} color="#0d9488" />
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

// ---- §5.4 Task 2 -----------------------------------------------------------

function Task2Section() {
  return (
    <>
      <SpecialtyMixCard />
      <SpecialtyCorrCard />
    </>
  );
}

function SpecialtyMixCard() {
  const [data, err] = useAnalysis(() => api.explore.task2SpecialtyMix('g3'));
  if (!data || !data.specialties) return <ChartCard title="Specialty mix over time" subtitle="" err={err} loading />;
  return (
    <ChartCard title="Specialty mix over time" subtitle={`stacked daily counts · ${data.smoothing_window}-day rolling mean`} err={err}>
      <StackedArea series={data.series} dates={data.dates} height={260} />
      <Legend items={data.specialties.map((s, i) => ({
        label: s,
        color: ['#1e6091', '#0d9488', '#d97706', '#7c3aed', '#dc2626', '#16a34a', '#475569'][i % 7],
        suffix: ` (${(data.totals[s] || 0).toLocaleString()})`,
      }))} />
    </ChartCard>
  );
}

function SpecialtyCorrCard() {
  const [data, err] = useAnalysis(() => api.explore.task2SpecialtyCorr('g3'));
  if (!data || !data.matrix) return <ChartCard title="Specialty correlation" subtitle="" err={err} loading />;
  return (
    <ChartCard title="Specialty correlation" subtitle="Pearson correlation between specialty daily counts" err={err}>
      <DivergingMatrix rows={data.labels} columns={data.labels} data={data.matrix} max={1} height={300} />
    </ChartCard>
  );
}

// ---- §5.5 Task 3 -----------------------------------------------------------

function Task3Section() {
  const [data, err] = useAnalysis(() => api.explore.task3ClassBalance('g3'));
  if (!data || !data.categories) return <ChartCard title="Critical-event class balance" subtitle="" err={err} loading />;
  const labels = data.categories.map((c) => c.category);
  const rates  = data.categories.map((c) => c.surge_rate);
  return (
    <ChartCard
      title="Critical-event class balance"
      subtitle={`surge defined as daily total > P${data.percentile} · expected rate ${data.expected_rate_pct}%`}
      err={err}
    >
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
    </ChartCard>
  );
}

// ---- §5.6 Layer 2 ----------------------------------------------------------

function Layer2Section() {
  const [data, err] = useAnalysis(() => api.explore.layer2HourlyProfile('g2'));
  if (!data || !data.rows) return <ChartCard title="Aggregate hourly profile" subtitle="" err={err} loading />;
  const means = data.rows.map((r) => r.mean);
  const upper = data.rows.map((r) => r.ci_high);
  const lower = data.rows.map((r) => r.ci_low);
  const labels = data.rows.map((r) => (r.hour % 3 === 0 ? `${r.hour}h` : ''));
  return (
    <>
      <ChartCard
        title="Aggregate hourly profile"
        subtitle={`mean ± 95% CI · peak-to-trough ratio ${data.peak_to_trough_ratio ?? '—'} · n=${data.n.toLocaleString()} hours`}
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

// ---- §5.7 Impact synthesis -------------------------------------------------

function SynthesisSection() {
  const [data, err] = useAnalysis(() => api.explore.impactMatrix('g1'));
  if (!data || !data.rows) return <ChartCard title="Impact matrix" subtitle="" err={err} loading />;

  const binaryRows = data.rows.filter((r) => r.kind === 'binary');
  const quartileRows = data.rows.filter((r) => r.kind === 'quartile');

  const binMatrix = binaryRows.map((r) => [r.true?.pct ?? null]);
  const qLevels = data.quartile_levels;
  const qMatrix = quartileRows.map((r) => qLevels.map((lvl) => r[lvl]?.pct ?? null));

  return (
    <>
      <ChartCard
        title="Calendar features · % deviation from baseline"
        subtitle="red = higher arrivals when the flag is true, teal = lower"
        err={err}
      >
        <DivergingMatrix rows={binaryRows.map((r) => r.feature)} columns={['Effect when true']} data={binMatrix} height={220} />
      </ChartCard>
      <ChartCard
        title="Weather quartiles · % deviation from grand mean"
        subtitle="each row: a continuous weather variable split into quartiles Q1–Q4"
      >
        <DivergingMatrix rows={quartileRows.map((r) => r.feature)} columns={qLevels} data={qMatrix} height={260} />
      </ChartCard>
    </>
  );
}

// ---- shared ----------------------------------------------------------------

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
