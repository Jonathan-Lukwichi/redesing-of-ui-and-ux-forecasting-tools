import { useEffect, useMemo, useRef, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import { api } from '../api/client';

const ICON_BY_ID = {
  daily_arrival: 'hospital',
  hourly_arrival: 'chart',
  clinical_daily: 'flask',
  clinical_hourly: 'flask',
  calendar: 'file',
  weather_daily: 'cloud',
  weather_hourly: 'cloud',
};

export default function DataHub() {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(null);
  const [uploadState, setUploadState] = useState({}); // {id: {status, error?, detail?, file?}}
  const [previews, setPreviews] = useState({});       // {id: previewObject}
  const [selectedId, setSelectedId] = useState(null);
  const [sourceStatus, setSourceStatus] = useState(null);
  const fileInputRef = useRef(null);
  const pendingIdRef = useRef(null);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api.datasets.inventory(ctrl.signal),
      api.datasets.sourceStatus(ctrl.signal).catch(() => null),
    ])
      .then(([inv, src]) => { setInventory(inv); setSourceStatus(src); })
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, []);

  const patchUpload = (id, patch) =>
    setUploadState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const clearUploadState = (id) =>
    setUploadState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const refreshInventory = async () => {
    try {
      const inv = await api.datasets.inventory();
      setInventory(inv);
    } catch (e) {
      setError(e.message);
    }
  };

  const onPickFile = (id) => {
    pendingIdRef.current = id;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const doUpload = async (id, file) => {
    patchUpload(id, { status: 'uploading', error: null, detail: null, file });
    try {
      const result = await api.datasets.upload(id, file);
      setPreviews((prev) => ({
        ...prev,
        [id]: { columns: result.columns, records: result.preview },
      }));
      clearUploadState(id);
      setSelectedId(id);
      await refreshInventory();
      return true;
    } catch (e) {
      patchUpload(id, {
        status: 'error',
        error: extractMessage(e),
        detail: e.detail && typeof e.detail === 'object' ? e.detail : null,
        file,
      });
      return false;
    }
  };

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0];
    const id = pendingIdRef.current;
    pendingIdRef.current = null;
    if (!file || !id) return;
    await doUpload(id, file);
  };

  const onFetch = async (id) => {
    patchUpload(id, { status: 'uploading', error: null, detail: null });
    try {
      const result = await api.datasets.fetch(id);
      setPreviews((prev) => ({
        ...prev,
        [id]: { columns: result.columns, records: result.preview },
      }));
      clearUploadState(id);
      setSelectedId(id);
      await refreshInventory();
    } catch (e) {
      patchUpload(id, {
        status: 'error',
        error: extractMessage(e),
        detail: e.detail && typeof e.detail === 'object' ? e.detail : null,
      });
    }
  };

  const onClear = async (id) => {
    try {
      await api.datasets.clear(id);
      setPreviews((prev) => { const next = { ...prev }; delete next[id]; return next; });
      if (selectedId === id) setSelectedId(null);
      await refreshInventory();
    } catch (e) {
      setError(e.message);
    }
  };

  const onClearAll = async () => {
    if (!confirm('Remove all loaded datasets from memory? Uploaded files will need to be re-added.')) return;
    try {
      await api.datasets.clearAll();
      setPreviews({});
      setUploadState({});
      setSelectedId(null);
      await refreshInventory();
    } catch (e) {
      setError(e.message);
    }
  };

  const onSendToBestFit = async (sourceId, bestFitId) => {
    const file = uploadState[sourceId]?.file;
    if (!file) return;
    clearUploadState(sourceId);
    await doUpload(bestFitId, file);
  };

  const onSelect = async (id, loaded) => {
    if (!loaded) return;
    setSelectedId(id);
    if (!previews[id]) {
      try {
        const p = await api.datasets.preview(id, 10);
        setPreviews((prev) => ({ ...prev, [id]: { columns: p.columns, records: p.records } }));
      } catch (e) {
        setError(e.message);
      }
    }
  };

  const { hospitalItems, externalItems } = useMemo(() => {
    if (!inventory) return { hospitalItems: [], externalItems: [] };
    return {
      hospitalItems: inventory.items.filter((it) => it.schema.category === 'hospital'),
      externalItems: inventory.items.filter((it) => it.schema.category === 'external'),
    };
  }, [inventory]);

  const selectedItem = inventory?.items.find((it) => it.schema.id === selectedId) || null;
  const loadedCount = inventory?.loaded_count || 0;

  return (
    <div className="content">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={onFileChosen}
      />

      <PageHero
        kicker="Data · Sources"
        title="Data Hub"
        sub="Upload the seven source files (four hospital datasets, three external) · privacy-safe: in-memory only, never persisted to disk"
        image="/images/hero-bg1.jpg"
        actions={
          <>
            <span className="tag tag-success" style={{ fontSize: 11 }}>
              <span className="dot" /> {inventory ? `${loadedCount}/${inventory.total} loaded` : 'Loading…'}
            </span>
            {loadedCount > 0 && (
              <button className="btn btn-sm" onClick={onClearAll} title="Remove all uploaded datasets from memory">
                <Icon name="logout" size={12} /> Clear all
              </button>
            )}
          </>
        }
      />

      {error && (
        <div className="card" style={{ borderColor: '#dc2626', background: '#fef5f5' }}>
          <div className="card-body" style={{ color: '#991b1b' }}>
            <strong>Inventory error.</strong> {error}
          </div>
        </div>
      )}

      <SectionHeader
        kicker="Section A · Private"
        title="Hospital data"
        sub="Steve Biko PURE DATASET · 4 files · stays in-memory in the FastAPI process for this session only"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {hospitalItems.map((item) => (
          <DatasetTile
            key={item.schema.id}
            item={item}
            uploadState={uploadState[item.schema.id]}
            selected={selectedId === item.schema.id}
            fetchAvailable={!!sourceStatus?.configured}
            onUpload={() => onPickFile(item.schema.id)}
            onFetch={() => onFetch(item.schema.id)}
            onClear={() => onClear(item.schema.id)}
            onSelect={() => onSelect(item.schema.id, item.loaded)}
            onDismiss={() => clearUploadState(item.schema.id)}
            onSendToBestFit={(bestFitId) => onSendToBestFit(item.schema.id, bestFitId)}
          />
        ))}
      </div>

      <SectionHeader
        kicker="Section B · Public"
        title="External factors"
        sub="South African calendar + Pretoria weather (Open-Meteo ERA5) · 3 files · usually preloaded across the full 2019–2026 window"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {externalItems.map((item) => (
          <DatasetTile
            key={item.schema.id}
            item={item}
            uploadState={uploadState[item.schema.id]}
            selected={selectedId === item.schema.id}
            fetchAvailable={!!sourceStatus?.configured}
            onUpload={() => onPickFile(item.schema.id)}
            onFetch={() => onFetch(item.schema.id)}
            onClear={() => onClear(item.schema.id)}
            onSelect={() => onSelect(item.schema.id, item.loaded)}
            onDismiss={() => clearUploadState(item.schema.id)}
            onSendToBestFit={(bestFitId) => onSendToBestFit(item.schema.id, bestFitId)}
          />
        ))}
      </div>

      {selectedItem && selectedItem.loaded && (
        <PreviewPanel
          item={selectedItem}
          preview={previews[selectedItem.schema.id]}
        />
      )}
    </div>
  );
}

// ---- Tile -------------------------------------------------------------------

function DatasetTile({
  item, uploadState, selected, fetchAvailable,
  onUpload, onFetch, onClear, onSelect, onDismiss, onSendToBestFit,
}) {
  const { schema, loaded, metadata } = item;
  const state = uploadState?.status || (loaded ? 'loaded' : 'idle');

  const isError = state === 'error';
  const isUploading = state === 'uploading';
  const isEmpty = !loaded && !isError && !isUploading;

  const borderStyle = isEmpty
    ? { border: '1.5px dashed #cbd5e1' }
    : isError
      ? { border: '1.5px solid #dc2626' }
      : selected
        ? { border: '2px solid #1e6091' }
        : { border: '1px solid #e4e7eb' };

  const background = isEmpty
    ? '#fafbfc'
    : isError
      ? '#fef5f5'
      : selected
        ? '#f8fafc'
        : 'white';

  return (
    <div
      className="card"
      onClick={loaded ? onSelect : undefined}
      style={{
        ...borderStyle,
        background,
        padding: 16,
        cursor: loaded ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minHeight: 180,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 6,
          background: isEmpty ? '#eef2f6' : 'var(--accent-soft, #e0f2f1)',
          color: isEmpty ? '#94a3b8' : 'var(--accent, #0d9488)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={ICON_BY_ID[schema.id] || 'file'} size={16} />
        </div>
        <StatusBadge state={state} loaded={loaded} schemaValid={loaded && metadata?.schema_valid} />
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: isEmpty ? '#475569' : '#0f172a' }}>
          {schema.label}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
          {schema.description}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {loaded && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 10, borderTop: '1px solid #eef0f3', fontSize: 11, color: '#94a3b8',
          }}>
            <span className="mono" style={{ fontSize: 10 }}>{metadata.filename}</span>
            <span className="tnum" style={{ color: '#334155', fontWeight: 500 }}>
              {metadata.rows.toLocaleString()} rows
            </span>
          </div>
          {metadata.date_range && (
            <div style={{ fontSize: 11, color: '#475569' }}>
              {metadata.date_range.start} → {metadata.date_range.end}
            </div>
          )}
          {!metadata.schema_valid && <SchemaDriftHint metadata={metadata} />}
        </>
      )}

      {isEmpty && (
        <div style={{
          paddingTop: 10, borderTop: '1px dashed #e4e7eb',
          fontSize: 11, color: '#94a3b8', textAlign: 'center',
        }}>
          Expected file: <span className="mono">{schema.source_filename_hint}</span>
          <div style={{ marginTop: 2 }}>
            ~{schema.expected_rows_hint?.toLocaleString() || '—'} rows · key{schema.key_columns.length > 1 ? 's' : ''} <span className="mono">{schema.key_columns.join(' + ')}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
        {isUploading ? (
          <button className="btn btn-sm" disabled style={{ flex: 1, justifyContent: 'center' }}>
            <Icon name="upload" size={12} /> Uploading…
          </button>
        ) : isError ? (
          <>
            <button className="btn btn-sm" onClick={onUpload} style={{ flex: 1, justifyContent: 'center' }}>
              <Icon name="upload" size={12} /> Try another file
            </button>
            <button className="btn btn-sm" onClick={onDismiss} title="Dismiss error">
              <Icon name="logout" size={12} />
            </button>
          </>
        ) : loaded ? (
          <>
            <button className="btn btn-sm" onClick={onUpload} style={{ flex: 1, justifyContent: 'center' }}>
              <Icon name="refresh" size={12} /> Re-upload
            </button>
            <button
              className="btn btn-sm"
              onClick={onClear}
              title="Remove this dataset from memory"
              style={{ color: '#b91c1c', borderColor: '#fecaca', background: '#fff7f7' }}
            >
              <Icon name="logout" size={12} /> Remove
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-primary btn-sm"
              onClick={onFetch}
              disabled={!fetchAvailable}
              title={fetchAvailable ? '' : 'Configure DATA_REPO + GITHUB_TOKEN in api/.env to enable Fetch'}
              style={{ flex: 1, justifyContent: 'center', opacity: fetchAvailable ? 1 : 0.55 }}
            >
              <Icon name="download" size={12} /> Fetch
            </button>
            <button
              className="btn btn-sm"
              onClick={onUpload}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Icon name="upload" size={12} /> Upload CSV
            </button>
          </>
        )}
      </div>

      {isError && (
        <ErrorPanel
          uploadState={uploadState}
          targetLabel={schema.label}
          onSendToBestFit={onSendToBestFit}
        />
      )}
    </div>
  );
}

function StatusBadge({ state, loaded, schemaValid }) {
  if (state === 'uploading') return <span className="tag tag-info" style={{ fontSize: 10 }}><span className="dot" /> Uploading</span>;
  if (state === 'error')     return <span className="tag tag-danger" style={{ fontSize: 10 }}><span className="dot" /> Wrong file</span>;
  if (!loaded)               return <span className="tag" style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b' }}>Empty</span>;
  if (schemaValid)           return <span className="tag tag-success" style={{ fontSize: 10 }}><span className="dot" /> Schema valid</span>;
  return <span className="tag tag-warning" style={{ fontSize: 10 }}><span className="dot" /> Schema drift</span>;
}

function ErrorPanel({ uploadState, targetLabel, onSendToBestFit }) {
  const detail = uploadState?.detail;
  const filename = detail?.filename || uploadState?.file?.name;
  const missing = detail?.missing_required || [];
  const bestFit = detail?.best_fit;

  return (
    <div style={{
      fontSize: 11, color: '#7f1d1d', background: '#fff1f2',
      border: '1px solid #fecaca', borderRadius: 4, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div>
        <strong>Wrong file for {targetLabel}.</strong>
        {filename && <> Uploaded: <span className="mono" style={{ fontSize: 10 }}>{filename}</span></>}
      </div>
      {!!missing.length && (
        <div>
          Missing required: <span className="mono" style={{ fontSize: 10 }}>
            {missing.slice(0, 4).join(', ')}{missing.length > 4 ? `, +${missing.length - 4} more` : ''}
          </span>
        </div>
      )}
      {bestFit && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <span style={{ color: '#475569' }}>
            Looks like <strong>{bestFit.label}</strong> ({Math.round(bestFit.confidence * 100)}% match).
          </span>
          <button
            className="btn btn-sm"
            onClick={() => onSendToBestFit(bestFit.id)}
            style={{ background: '#0d9488', color: 'white', borderColor: '#0d9488', flexShrink: 0 }}
          >
            <Icon name="check" size={12} /> Upload there
          </button>
        </div>
      )}
      {!bestFit && !missing.length && (
        <div>{uploadState?.error}</div>
      )}
    </div>
  );
}

function SchemaDriftHint({ metadata }) {
  const missingCount = metadata.missing_expected?.length || 0;
  const extraCount = metadata.extra_columns?.length || 0;
  const parts = [];
  if (missingCount) parts.push(`${missingCount} missing`);
  if (extraCount) parts.push(`${extraCount} extra`);
  return (
    <div style={{
      fontSize: 11, color: '#92400e', background: '#fef3c7',
      border: '1px solid #fde68a', borderRadius: 4, padding: '6px 8px',
    }}>
      Schema: {parts.join(' · ') || 'drift detected'}
    </div>
  );
}

// ---- Section header ---------------------------------------------------------

function SectionHeader({ kicker, title, sub }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: '#1e6091',
        textTransform: 'uppercase', letterSpacing: 1.2,
      }}>{kicker}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ---- Preview panel ----------------------------------------------------------

function PreviewPanel({ item, preview }) {
  const { schema, metadata } = item;
  const cols = preview?.columns || metadata.columns || [];
  const records = preview?.records || [];

  const dateRange = metadata.date_range
    ? `${metadata.date_range.start} → ${metadata.date_range.end}`
    : '—';

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Preview · {metadata.filename || schema.label}</div>
          <div className="card-sub">
            {metadata.rows.toLocaleString()} rows · {cols.length} columns · {dateRange}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {metadata.schema_valid
            ? <span className="tag tag-success"><span className="dot" /> Schema valid</span>
            : <span className="tag tag-warning"><span className="dot" /> Schema drift</span>}
          <span className="tag">{schema.grain}</span>
          <span className="tag mono" style={{ fontSize: 10 }}>
            key: {schema.key_columns.join('+')}
          </span>
        </div>
      </div>

      <div className="card-body">
        {!metadata.schema_valid && <SchemaDetails metadata={metadata} />}

        <div style={{ border: '1px solid #e4e7eb', borderRadius: 6, overflow: 'auto', maxHeight: 360 }}>
          <table className="tbl">
            <thead>
              <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {records.map((row, i) => (
                <tr key={i}>
                  {cols.map((c) => (
                    <td key={c} className={typeof row[c] === 'number' ? 'num mono' : 'mono'}>
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid-kpi" style={{ marginTop: 16 }}>
          <KpiTile label="Total rows" value={metadata.rows.toLocaleString()} color="#0f172a" />
          <KpiTile
            label="Expected rows"
            value={metadata.expected_rows_hint?.toLocaleString() || '—'}
            color="#475569"
          />
          <KpiTile
            label="Missing required"
            value={metadata.missing_required?.length || 0}
            color={(metadata.missing_required?.length || 0) === 0 ? '#16a34a' : '#dc2626'}
          />
          <KpiTile
            label="Extra columns"
            value={metadata.extra_columns?.length || 0}
            color={(metadata.extra_columns?.length || 0) === 0 ? '#16a34a' : '#d97706'}
          />
        </div>
      </div>
    </div>
  );
}

function SchemaDetails({ metadata }) {
  const missing = metadata.missing_expected || [];
  const extra = metadata.extra_columns || [];
  if (!missing.length && !extra.length) return null;
  return (
    <div style={{
      marginBottom: 16, padding: 12, background: '#fef3c7',
      border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#78350f',
    }}>
      <strong>Schema drift detected.</strong>
      {!!missing.length && (
        <div style={{ marginTop: 6 }}>
          <strong>Missing ({missing.length}):</strong>{' '}
          <span className="mono" style={{ fontSize: 11 }}>{missing.slice(0, 10).join(', ')}{missing.length > 10 ? ', …' : ''}</span>
        </div>
      )}
      {!!extra.length && (
        <div style={{ marginTop: 6 }}>
          <strong>Extra ({extra.length}):</strong>{' '}
          <span className="mono" style={{ fontSize: 11 }}>{extra.slice(0, 10).join(', ')}{extra.length > 10 ? ', …' : ''}</span>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, color }) {
  return (
    <div style={{ padding: '10px 12px', background: '#fafbfc', border: '1px solid #eef0f3', borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 18, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function extractMessage(err) {
  if (err?.detail && typeof err.detail === 'object' && err.detail.message) return err.detail.message;
  if (typeof err?.detail === 'string') return err.detail;
  return err?.message || 'Upload failed';
}

function formatCell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
  return String(v);
}
