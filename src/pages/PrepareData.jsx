import { useEffect, useMemo, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { BarChart, Heatmap } from '../components/Charts';
import { api } from '../api/client';

const GROUP_ICON = { g1: 'chart', g2: 'forecast', g3: 'flask', g4: 'cpu' };

export default function PrepareData({ onNavigate }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [buildState, setBuildState] = useState({}); // {id: 'idle'|'building'|'error', error?}
  const [selectedId, setSelectedId] = useState(null);
  const [quality, setQuality] = useState({});  // {id: qualityData}
  const [preview, setPreview] = useState({});  // {id: {columns, records, column_info}}

  useEffect(() => {
    const ctrl = new AbortController();
    api.prepare.groups(ctrl.signal)
      .then((r) => {
        setGroups(r);
        const firstBuilt = r.items.find((it) => it.built);
        if (firstBuilt) setSelectedId(firstBuilt.spec.id);
      })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, []);

  const refresh = async () => {
    try {
      const r = await api.prepare.groups();
      setGroups(r);
    } catch (e) { setError(e.message); }
  };

  const patchBuild = (id, patch) =>
    setBuildState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const onBuild = async (id) => {
    patchBuild(id, { status: 'building', error: null });
    try {
      await api.prepare.build({ group: id });
      patchBuild(id, { status: 'idle' });
      await refresh();
      setSelectedId(id);
      // pre-fetch quality + preview for the panel
      try {
        const [q, p] = await Promise.all([
          api.prepare.quality(id),
          api.prepare.preview(id, 20),
        ]);
        setQuality((prev) => ({ ...prev, [id]: q }));
        setPreview((prev) => ({ ...prev, [id]: p }));
      } catch (e) { /* non-fatal */ }
    } catch (e) {
      patchBuild(id, { status: 'error', error: extractMessage(e) });
    }
  };

  const onClear = async (id) => {
    try {
      await api.prepare.clear(id);
      setQuality((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setPreview((prev) => { const n = { ...prev }; delete n[id]; return n; });
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) { setError(e.message); }
  };

  const onSelect = async (id) => {
    setSelectedId(id);
    if (!quality[id]) {
      try {
        const [q, p] = await Promise.all([
          api.prepare.quality(id),
          api.prepare.preview(id, 20),
        ]);
        setQuality((prev) => ({ ...prev, [id]: q }));
        setPreview((prev) => ({ ...prev, [id]: p }));
      } catch (e) { setError(e.message); }
    }
  };

  const builtIds = useMemo(
    () => groups?.items.filter((it) => it.built).map((it) => it.spec.id) || [],
    [groups],
  );
  const anyDatasetLoaded = useMemo(
    () => !!groups?.items.some((it) => it.sources.items.some((s) => s.loaded)),
    [groups],
  );
  const selectedItem = groups?.items.find((it) => it.spec.id === selectedId) || null;

  return (
    <div className="content">
      <PageHero
        kicker="Data · Prepare"
        title="Prepare Data"
        sub="Merge the 7 source files into the four analysis groups G1–G4 · cleaning audit · data-quality summary · slice by COVID regime or schema era"
        image="/images/prepare-bg.jpg"
        actions={
          <span className="tag tag-success" style={{ fontSize: 11 }}>
            <span className="dot" /> {groups ? `${builtIds.length}/${groups.items.length} groups merged` : 'Loading…'}
          </span>
        }
      />

      {error && (
        <div className="card" style={{ borderColor: '#dc2626', background: '#fef5f5' }}>
          <div className="card-body" style={{ color: '#991b1b' }}>
            <strong>Error.</strong> {error}
          </div>
        </div>
      )}

      {groups && !anyDatasetLoaded ? (
        <EmptyPipeline onGoToHub={() => onNavigate && onNavigate('upload')} />
      ) : (
        <>
          <SectionHeader
            kicker="Section · Merges"
            title="Analysis groups G1–G4"
            sub="Each group merges one hospital dataset with calendar + weather on the indicated key. Cleaning runs as part of every merge."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {groups?.items.map((item) => (
              <GroupCard
                key={item.spec.id}
                item={item}
                buildState={buildState[item.spec.id]}
                selected={selectedId === item.spec.id}
                onBuild={() => onBuild(item.spec.id)}
                onClear={() => onClear(item.spec.id)}
                onSelect={() => onSelect(item.spec.id)}
              />
            ))}
          </div>

          {selectedItem && selectedItem.built && (
            <DetailPanel
              item={selectedItem}
              quality={quality[selectedItem.spec.id]}
              preview={preview[selectedItem.spec.id]}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---- Group card -------------------------------------------------------------

function GroupCard({ item, buildState, selected, onBuild, onClear, onSelect }) {
  const { spec, sources, can_build, built, metadata } = item;
  const status = buildState?.status || (built ? 'built' : 'idle');
  const isBuilding = status === 'building';
  const isError = status === 'error';

  const borderStyle = isError
    ? { border: '1.5px solid #dc2626' }
    : selected
      ? { border: '2px solid #1e6091' }
      : built
        ? { border: '1px solid #c7d2db' }
        : { border: '1.5px dashed #cbd5e1' };

  const background = isError ? '#fef5f5' : selected ? '#f8fafc' : built ? 'white' : '#fafbfc';

  return (
    <div
      className="card"
      onClick={built ? onSelect : undefined}
      style={{
        ...borderStyle, background,
        padding: 16, cursor: built ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 10, minHeight: 260,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6,
          background: built ? 'var(--accent-soft, #e0f2f1)' : '#eef2f6',
          color: built ? 'var(--accent, #0d9488)' : '#94a3b8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={GROUP_ICON[spec.id] || 'chart'} size={16} />
        </div>
        <GroupStatusBadge status={status} can_build={can_build} />
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: built ? '#0f172a' : '#475569' }}>{spec.label}</div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>{spec.description}</div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
          Sources · key {spec.key_columns.join(' + ')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sources.items.map((s) => (
            <div key={s.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontSize: 11, padding: '4px 6px', borderRadius: 4,
              background: s.loaded ? '#ecfdf5' : '#fef2f2',
              color: s.loaded ? '#065f46' : '#991b1b',
            }}>
              <span className="mono" style={{ fontSize: 10 }}>{s.id}</span>
              <span style={{ fontWeight: 600 }}>
                {s.loaded ? `✓ ${s.rows?.toLocaleString() || '—'}` : '✗ not loaded'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {built && metadata && (
        <div style={{
          paddingTop: 10, borderTop: '1px solid #eef0f3', fontSize: 11, color: '#475569',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Rows</span>
            <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 600 }}>
              {metadata.rows.toLocaleString()}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Columns</span>
            <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 600 }}>
              {metadata.n_columns}
            </span>
          </div>
          {metadata.zero_day_count != null && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Zero-arrival {spec.grain === 'daily' ? 'days' : 'hours'}</span>
              <span className="mono tnum" style={{ color: metadata.zero_day_count > 0 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                {metadata.zero_day_count.toLocaleString()}
              </span>
            </div>
          )}
          {metadata.date_range && (
            <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>
              {metadata.date_range.start} → {metadata.date_range.end}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
        {isBuilding ? (
          <button className="btn btn-sm" disabled style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="refresh" size={12} /> Merging…
          </button>
        ) : built ? (
          <>
            <button className="btn btn-sm" onClick={onBuild} style={{ flex: 1, justifyContent: 'center' }}>
              <Icon name="refresh" size={12} /> Re-merge
            </button>
            <button
              className="btn btn-sm"
              onClick={onClear}
              title="Drop this merged group from memory"
              style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7' }}
            >
              <Icon name="logout" size={12} /> Remove
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onBuild}
            disabled={!can_build}
            style={{ flex: 1, justifyContent: 'center', opacity: can_build ? 1 : 0.5 }}
            title={can_build ? '' : 'Upload all required datasets first'}
          >
            <Icon name="play" size={12} /> Merge
          </button>
        )}
      </div>

      {isError && (
        <div style={{
          fontSize: 11, color: '#7f1d1d', background: '#fff1f2',
          border: '1px solid #fecaca', borderRadius: 4, padding: '6px 8px',
        }}>
          {buildState.error}
        </div>
      )}
    </div>
  );
}

function GroupStatusBadge({ status, can_build }) {
  if (status === 'building') return <span className="tag tag-info" style={{ fontSize: 10 }}><span className="dot" /> Merging</span>;
  if (status === 'error')    return <span className="tag tag-danger" style={{ fontSize: 10 }}><span className="dot" /> Merge failed</span>;
  if (status === 'built')    return <span className="tag tag-success" style={{ fontSize: 10 }}><span className="dot" /> Merged</span>;
  if (!can_build)            return <span className="tag tag-warning" style={{ fontSize: 10 }}><span className="dot" /> Sources missing</span>;
  return <span className="tag" style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b' }}>Ready</span>;
}

function EmptyPipeline({ onGoToHub }) {
  return (
    <div className="card" style={{
      padding: 32, textAlign: 'center', border: '1.5px dashed #cbd5e1', background: '#fafbfc',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 12,
        background: '#eef2f6', color: '#94a3b8',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name="upload" size={26} />
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
        No datasets in the pipeline yet
      </div>
      <div style={{ fontSize: 13, color: '#64748b', maxWidth: 520, lineHeight: 1.5 }}>
        Upload the seven source files in <strong>Data Hub</strong> first.
        Once the hospital and external files are loaded, you can merge them here
        into the four analysis groups (G1 daily demand, G2 hourly demand,
        G3 clinical daily, G4 clinical hourly).
      </div>
      {onGoToHub && (
        <button className="btn btn-primary" onClick={onGoToHub} style={{ marginTop: 6 }}>
          <Icon name="upload" size={14} /> Go to Data Hub
        </button>
      )}
    </div>
  );
}

// ---- Detail panel -----------------------------------------------------------

function DetailPanel({ item, quality, preview }) {
  const { spec, metadata } = item;

  return (
    <>
      <SectionHeader
        kicker={`Group · ${spec.id.toUpperCase()}`}
        title={`${spec.label} · details`}
        sub={`${metadata.rows.toLocaleString()} rows × ${metadata.n_columns} columns · ${metadata.date_range?.start} → ${metadata.date_range?.end}`}
      />

      <div className="layout-aside">
        <CleaningAudit audit={metadata.audit} />
        <SchemaPreview preview={preview} />
      </div>

      <div className="grid-3">
        <MissingnessCard quality={quality} />
        <RegimeCard quality={quality} grain={spec.grain} />
        <ValidationCard quality={quality} grain={spec.grain} />
      </div>
    </>
  );
}

function CleaningAudit({ audit }) {
  if (!audit || !audit.length) return null;
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Cleaning audit</div>
          <div className="card-sub">{audit.length} steps · what the join + cleaning pipeline did</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {audit.map((step, i) => (
          <div key={i} style={{
            border: '1px solid #eef0f3', borderRadius: 6, padding: '8px 10px',
            background: '#fafbfc',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
              {i + 1}. {step.step}
            </div>
            <AuditDetails step={step} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AuditDetails({ step }) {
  const entries = Object.entries(step).filter(([k]) => k !== 'step');
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {entries.map(([k, v]) => (
        <span key={k} style={{
          fontSize: 10, color: '#475569', background: '#fff',
          border: '1px solid #e4e7eb', borderRadius: 4, padding: '2px 6px',
        }}>
          <span style={{ color: '#94a3b8' }}>{k}:</span>{' '}
          <span className="mono">{formatAuditValue(v)}</span>
        </span>
      ))}
    </div>
  );
}

function formatAuditValue(v) {
  if (v == null) return '—';
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (v.length > 4) return `[${v.slice(0, 4).join(', ')}, +${v.length - 4}]`;
    return `[${v.join(', ')}]`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function SchemaPreview({ preview }) {
  if (!preview) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Schema preview</div></div>
        <div className="card-body" style={{ color: '#64748b' }}>Loading preview…</div>
      </div>
    );
  }
  const rows = preview.column_info?.slice(0, 30) || [];
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Schema preview · first 30 columns</div>
          <div className="card-sub">{preview.columns.length} columns total · non-null counts from the 20-row preview slice</div>
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th className="num">Non-null</th>
            <th className="num">Unique</th>
            <th>Sample</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.column}>
              <td className="mono" style={{ color: '#1e6091' }}>{r.column}</td>
              <td><span className="tag" style={{ fontSize: 10 }}>{r.dtype}</span></td>
              <td className="num">{r.non_null}</td>
              <td className="num">{r.unique ?? '—'}</td>
              <td className="mono" style={{ fontSize: 11 }}>{formatSample(r.sample)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSample(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  return String(v).slice(0, 22);
}

function MissingnessCard({ quality }) {
  if (!quality) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Missingness</div></div>
        <div className="card-body" style={{ color: '#64748b' }}>Loading…</div>
      </div>
    );
  }
  const rows = quality.missingness.slice(0, 10);
  if (!rows.length) {
    return (
      <div className="card">
        <div className="card-header"><div className="card-title">Missingness</div></div>
        <div className="card-body" style={{ color: '#16a34a', fontSize: 13 }}>
          ✓ No missing values across all {quality.columns} columns.
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Missingness · top 10</div>
          <div className="card-sub">{quality.missingness_total_columns} of {quality.columns} columns have missing values</div>
        </div>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r) => (
          <div key={r.column}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
              <span className="mono" style={{ color: '#334155', fontSize: 11 }}>{r.column}</span>
              <span className="tnum" style={{ color: r.pct > 5 ? '#dc2626' : r.pct > 1 ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                {r.pct}% ({r.missing.toLocaleString()})
              </span>
            </div>
            <div className="bar"><div className="bar-fill" style={{ width: Math.min(100, r.pct * 2) + '%', background: r.pct > 5 ? '#dc2626' : r.pct > 1 ? '#d97706' : '#94a3b8' }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegimeCard({ quality, grain }) {
  if (!quality) return null;
  const regimes = quality.regime_counts || {};
  const order = ['pre', 'during', 'post'];
  const labels = order.map((k) => k);
  const data = order.map((k) => regimes[k] || 0);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">COVID regime split</div>
          <div className="card-sub">pre / during / post · {grain} grain</div>
        </div>
      </div>
      <div className="card-body">
        <BarChart data={data} labels={labels} height={170} color="#0d9488" />
        <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
          {order.map((k) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span style={{ textTransform: 'capitalize' }}>{k}-COVID</span>
              <span className="mono tnum" style={{ color: '#0f172a', fontWeight: 600 }}>
                {(regimes[k] || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ValidationCard({ quality, grain }) {
  if (!quality) return null;
  const rows = [
    ['Total rows',          quality.rows.toLocaleString(),       '#0f172a'],
    ['Date coverage',       quality.date_range
                              ? `${quality.date_range.start} → ${quality.date_range.end}`
                              : '—',                              '#0f172a'],
    [`Zero-arrival ${grain === 'daily' ? 'days' : 'hours'}`,
                            quality.zero_day_count != null
                              ? quality.zero_day_count.toLocaleString()
                              : '—',
                            quality.zero_day_count > 0 ? '#d97706' : '#16a34a'],
    ['Columns with missing', `${quality.missingness_total_columns} / ${quality.columns}`,
                            quality.missingness_total_columns === 0 ? '#16a34a' : '#d97706'],
    ['Duplicate keys',      quality.duplicate_keys?.count?.toLocaleString() || '0',
                            (quality.duplicate_keys?.count || 0) === 0 ? '#16a34a' : '#dc2626'],
    ['Schema eras present', quality.era_counts ? Object.keys(quality.era_counts).length : '—',
                            '#0f172a'],
  ];

  return (
    <div className="card">
      <div className="card-header"><div className="card-title">Validation summary</div></div>
      <div style={{ padding: '8px 16px 16px' }}>
        {rows.map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eef0f3', fontSize: 13 }}>
            <span style={{ color: '#475569' }}>{l}</span>
            <span className="mono" style={{ color: c, fontWeight: 600 }}>{v}</span>
          </div>
        ))}
        {quality.era_counts && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
            Era breakdown: {Object.entries(quality.era_counts).map(([k, v]) => `Era ${k}: ${v.toLocaleString()}`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- shared -----------------------------------------------------------------

function SectionHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1e6091', textTransform: 'uppercase', letterSpacing: 1.2 }}>{kicker}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function extractMessage(err) {
  if (err?.detail && typeof err.detail === 'object' && err.detail.message) return err.detail.message;
  if (typeof err?.detail === 'string') return err.detail;
  return err?.message || 'Merge failed';
}
