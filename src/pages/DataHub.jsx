import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHero from '../components/PageHero';
import Icon from '../components/Icon';
import Card, { CardGrid } from '../components/ui/Card';
import DropZone from '../components/pipeline/DropZone';
import FileChecklist from '../components/pipeline/FileChecklist';
import StageTracker from '../components/pipeline/StageTracker';
import { classify, unknownReason } from '../components/pipeline/classify';
import { api } from '../api/client';

const ICON_BY_ID = {
  daily_arrival: 'hospital',
  hourly_arrival: 'chart',
  clinical_daily: 'flask',
  clinical_hourly: 'flask',
  calendar: 'file',
  weather_daily: 'cloud',
  weather_hourly: 'cloud',
  inventory_items: 'file',
  inventory_movements: 'chart',
  staff_list: 'file',
  shift_log: 'file',
  staffing_daily: 'chart',
};

// Inventory and scheduling files are uploaded only; there is no private repo copy to fetch.
const UPLOAD_ONLY = ['inventory', 'scheduling'];

// The four transformed tables a run builds from the registers.
const TRANSFORMED_IDS = ['daily_arrival', 'hourly_arrival', 'clinical_daily', 'clinical_hourly'];
const POLL_MS = 2000;

// Where a finished run's results can be read.
const RESULT_LINKS = [
  ['Explore', 'explore'], ['Forecast', 'forecast-total'], ['Staffing', 'staff'],
  ['Supply', 'supply'], ['Optimization', 'optimize'], ['Action Center', 'actions'],
];

export default function DataHub({ onNavigate }) {
  const [inventory, setInventory] = useState(null);
  const [error, setError] = useState(null);
  const [uploadState, setUploadState] = useState({}); // {id: {status, error?, detail?, file?}}
  const [previews, setPreviews] = useState({});       // {id: previewObject}
  const [selectedId, setSelectedId] = useState(null);
  const [sourceStatus, setSourceStatus] = useState(null);
  const fileInputRef = useRef(null);
  const pendingIdRef = useRef(null);

  // ---- Pipeline state: load reads status, staged and preflight (GETs only).
  const [runStatus, setRunStatus] = useState(null);
  const [runStatusError, setRunStatusError] = useState(false);
  const [staged, setStaged] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [preflightError, setPreflightError] = useState(false);
  const [dropResults, setDropResults] = useState([]);
  const [progress, setProgress] = useState(null);
  const [confirmMonths, setConfirmMonths] = useState(null);
  const [runMessage, setRunMessage] = useState(null);
  const [starting, setStarting] = useState(false);

  const refreshStatus = useCallback((signal) => api.pipeline.status(signal)
    .then((s) => { setRunStatus(s); setRunStatusError(false); })
    .catch((e) => { if (e.name !== 'AbortError') setRunStatusError(true); }), []);

  const refreshStaging = useCallback((signal) => Promise.all([
    api.pipeline.staged(signal).then(setStaged).catch(() => {}),
    api.pipeline.preflight(signal)
      .then((p) => { setPreflight(p); setPreflightError(false); })
      .catch((e) => { if (e.name !== 'AbortError') setPreflightError(true); }),
  ]), []);

  useEffect(() => {
    const ctrl = new AbortController();
    refreshStatus(ctrl.signal);
    refreshStaging(ctrl.signal);
    return () => ctrl.abort();
  }, [refreshStatus, refreshStaging]);

  // Poll only while a run is active. A reload reads status first, so a run
  // started earlier is picked up again. When it ends, re-read what it changed.
  const running = !!runStatus?.running;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!running) {
      if (wasRunning.current) {
        wasRunning.current = false;
        setRunMessage(null);
        refreshStaging();
        api.datasets.inventory().then(setInventory).catch(() => {});
      }
      return undefined;
    }
    wasRunning.current = true;
    let alive = true;
    const timer = setInterval(() => {
      api.pipeline.status().then((s) => { if (alive) setRunStatus(s); }).catch(() => {});
    }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [running, refreshStaging]);

  // Registers are transformed as they arrive: closing the tab mid-way stops the rest.
  const uploading = !!progress && !progress.finished;
  useEffect(() => {
    if (!uploading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

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

  // ---- Drop zone: classify by name, then upload one file at a time --------
  const patchResult = (key, patch) =>
    setDropResults((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const uploadOne = async (entry) => {
    if (entry.kind === 'register') {
      return registerReceipt(await api.pipeline.uploadRegister(entry.file));
    }
    const meta = await api.datasets.upload(entry.id, entry.file);
    const label = inventory?.items.find((it) => it.schema.id === entry.id)?.schema.label || entry.id;
    return `${(meta.rows ?? 0).toLocaleString()} rows loaded as ${label}.`;
  };

  const onDropFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploading) return;
    const schemas = (inventory?.items || []).map((it) => it.schema);
    const stamp = Date.now();
    const entries = files.map((file, i) => {
      const c = classify(file.name, schemas);
      return {
        key: `${stamp}-${i}`, file, name: file.name, kind: c.kind, id: c.id,
        state: c.kind === 'unknown' ? 'rejected' : 'waiting',
        message: c.kind === 'unknown' ? unknownReason(file.name) : 'Waiting.',
      };
    });
    // CSVs take seconds; registers are transformed one at a time after them.
    const queue = [...entries.filter((e) => e.kind === 'slot'), ...entries.filter((e) => e.kind === 'register')];
    setDropResults([...entries.filter((e) => e.kind === 'unknown'), ...queue]);
    if (!queue.length) { setProgress(null); return; }

    let ok = 0;
    for (let i = 0; i < queue.length; i += 1) {
      const e = queue[i];
      setProgress({ current: i + 1, total: queue.length, name: e.name });
      patchResult(e.key, { state: 'uploading', message: 'Uploading…' });
      try {
        const message = await uploadOne(e);
        ok += 1;
        patchResult(e.key, { state: 'ok', message, file: null });
      } catch (err) {
        const bestFit = err?.detail && typeof err.detail === 'object' ? err.detail.best_fit : null;
        patchResult(e.key, { state: 'failed', message: extractMessage(err), bestFit: bestFit || null });
      }
    }
    // Re-read the checklist before saying "Finished", so it never shows stale problems.
    await Promise.all([refreshInventory(), refreshStaging()]);
    setProgress({ finished: true, total: queue.length, ok, failed: queue.length - ok });
  };

  const onDropBestFit = async (result) => {
    patchResult(result.key, { state: 'uploading', message: 'Uploading…', bestFit: null });
    try {
      const message = await uploadOne({ kind: 'slot', id: result.bestFit.id, file: result.file });
      patchResult(result.key, { state: 'ok', message, file: null });
    } catch (err) {
      patchResult(result.key, { state: 'failed', message: extractMessage(err) });
    }
    await Promise.all([refreshInventory(), refreshStaging()]);
  };

  // ---- Run ------------------------------------------------------------------
  const startRun = async () => {
    setConfirmMonths(null);
    setRunMessage(null);
    setStarting(true);
    try {
      setRunStatus(await api.pipeline.run());
    } catch (e) {
      if (e.status === 409) {
        setRunMessage('A run is already in progress. Its progress is shown below.');
        // Start polling now; the first poll replaces this with the real stages.
        setRunStatus((prev) => ({ ...(prev || {}), stages: prev?.stages || [], running: true }));
      } else {
        setRunMessage(extractMessage(e));
      }
    } finally {
      setStarting(false);
    }
  };

  // Months the staged registers would overwrite are confirmed in the page first.
  const onRunClick = () => {
    const months = preflight?.replaced_months || [];
    if (months.length) setConfirmMonths(months);
    else startRun();
  };

  const goTo = (page) => {
    if (onNavigate) onNavigate(page);
    else window.location.hash = page;
  };

  const { hospitalItems, externalItems, opsItems } = useMemo(() => {
    if (!inventory) return { hospitalItems: [], externalItems: [], opsItems: [] };
    return {
      hospitalItems: inventory.items.filter((it) => it.schema.category === 'hospital'),
      externalItems: inventory.items.filter((it) => it.schema.category === 'external'),
      opsItems: inventory.items.filter((it) => UPLOAD_ONLY.includes(it.schema.category)),
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
        sub="Drop the monthly registers and the source files, then run the whole pipeline · privacy-safe: in-memory only, never persisted to disk"
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
        <div className="card" style={{ borderColor: 'var(--danger)', background: '#fef5f5' }}>
          <div className="card-body" style={{ color: '#991b1b' }}>
            <strong>Inventory error.</strong> {error}
          </div>
        </div>
      )}

      <SectionHeader
        kicker="Step 1 · Upload"
        title="Upload everything"
        sub="Registers are transformed as they arrive · CSVs go to the slot their name matches"
      />
      <DropZone
        disabled={uploading || running}
        disabledReason={running ? 'A run is in progress. Upload again when it finishes.' : 'Uploading…'}
        progress={progress}
        results={dropResults}
        onFiles={onDropFiles}
        onSendToBestFit={onDropBestFit}
      />
      <FileChecklist
        items={inventory?.items || []}
        staged={staged}
        preflight={preflight}
        preflightError={preflightError}
      />

      <SectionHeader
        kicker="Step 2 · Run"
        title="Run the full pipeline"
        sub="Check, transform, consolidate, analyse, forecast, optimise and rebuild the recommendations"
      />
      <CardGrid columns={2} minItemWidth={300}>
        <RunPanel
          preflight={preflight}
          preflightError={preflightError}
          running={running}
          uploading={uploading}
          starting={starting}
          confirmMonths={confirmMonths}
          message={runMessage}
          onRun={onRunClick}
          onConfirm={startRun}
          onCancel={() => setConfirmMonths(null)}
        />
        <StagedPanel
          staged={staged}
          items={inventory?.items || []}
          running={running}
          onChanged={refreshStaging}
        />
      </CardGrid>
      <RunSummary status={runStatus} onGo={goTo} />
      <StageTracker status={runStatus} error={runStatusError} />

      <details className="pl-advanced">
        <summary>Advanced: upload or fetch one file at a time</summary>
        <div className="pl-advanced-body">
      <SectionHeader
        kicker="Section A · Private"
        title="Hospital data"
        sub="Hospital dataset · 4 files · stays in-memory in the FastAPI process for this session only"
      />
      <CardGrid columns={4} minItemWidth={240}>
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
      </CardGrid>

      <SectionHeader
        kicker="Section B · Public"
        title="External factors"
        sub="South African calendar + local weather (Open-Meteo ERA5) · 3 files · usually preloaded across the full 2019–2026 window"
      />
      <CardGrid columns={3} minItemWidth={240}>
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
      </CardGrid>

      <SectionHeader
        kicker="Section C · Operations"
        title="Inventory and staffing"
        sub="Supply catalogue, stock movements, staff list and shift logs · 5 files · upload only · simulated demo pack in demo-data/"
      />
      <CardGrid columns={3} minItemWidth={240}>
        {opsItems.map((item) => (
          <DatasetTile
            key={item.schema.id}
            item={item}
            uploadState={uploadState[item.schema.id]}
            selected={selectedId === item.schema.id}
            fetchAvailable={false}
            uploadOnly
            onUpload={() => onPickFile(item.schema.id)}
            onFetch={() => onFetch(item.schema.id)}
            onClear={() => onClear(item.schema.id)}
            onSelect={() => onSelect(item.schema.id, item.loaded)}
            onDismiss={() => clearUploadState(item.schema.id)}
            onSendToBestFit={(bestFitId) => onSendToBestFit(item.schema.id, bestFitId)}
          />
        ))}
      </CardGrid>

      {selectedItem && selectedItem.loaded && (
        <PreviewPanel
          item={selectedItem}
          preview={previews[selectedItem.schema.id]}
        />
      )}
        </div>
      </details>
    </div>
  );
}

// ---- Pipeline panels ----------------------------------------------------------

function registerReceipt(r) {
  const tail = { replaced: ' Replaced the staged copy of that month.', unchanged: ' Already staged, unchanged.' }[r.status] || '';
  return `${r.month}: ${r.days} days, ${(r.arrivals ?? 0).toLocaleString()} arrivals.${tail}`;
}

function RunPanel({ preflight, preflightError, running, uploading, starting, confirmMonths, message, onRun, onConfirm, onCancel }) {
  const canRun = !!preflight?.ok && !running && !uploading && !starting && !confirmMonths;
  let reason = 'All required files are present and agree with each other.';
  if (running) reason = 'A run is in progress.';
  else if (uploading) reason = 'Wait for the uploads to finish.';
  else if (preflightError) reason = 'The checks could not be loaded. Is the server running?';
  else if (!preflight) reason = 'Checking the files…';
  else if (!preflight.ok) reason = 'Fix what the checklist marks as missing or a problem first.';
  else if (preflight.replaced_months?.length) {
    const n = preflight.replaced_months.length;
    reason = `Ready. The staged registers will replace ${n} month${n === 1 ? '' : 's'} of the uploaded history.`;
  }

  return (
    <Card className="pl-run">
      <Card.Header icon={<Icon name="play" size={16} />}>
        <Card.Title>Run full pipeline</Card.Title>
        <Card.Description>{reason}</Card.Description>
      </Card.Header>
      <Card.Actions>
        <button className="btn btn-primary" disabled={!canRun} onClick={onRun}>
          <Icon name="play" size={12} /> Run full pipeline
        </button>
      </Card.Actions>
      {confirmMonths && (
        <div className="pl-confirm" role="group" aria-label="Confirm replacing months">
          <div>
            <strong>Replace {confirmMonths.length} month{confirmMonths.length === 1 ? '' : 's'}?</strong>{' '}
            The staged registers will replace these months of the uploaded history:{' '}
            <span className="tnum">{confirmMonths.join(', ')}</span>.
          </div>
          <Card.Actions>
            <button className="btn btn-primary btn-sm" onClick={onConfirm} autoFocus>Replace and run</button>
            <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
          </Card.Actions>
        </div>
      )}
      {message && <div className="pl-note" role="status">{message}</div>}
    </Card>
  );
}

function RunSummary({ status, onGo }) {
  if (!status || status.running || !status.finished_at) return null;
  const stages = status.stages || [];
  const failed = stages.find((s) => s.status === 'failed');
  const amber = stages.filter((s) => s.status === 'amber').length;
  if (failed) {
    return (
      <Card className="pl-summary" tone="danger">
        <Card.Title>The run stopped at {failed.label}</Card.Title>
        <Card.Description>
          {failed.receipt} Earlier results were cleared, not half-replaced. Fix the problem and run again.
        </Card.Description>
      </Card>
    );
  }
  return (
    <Card className="pl-summary">
      <Card.Header icon={<Icon name="check" size={16} />}>
        <Card.Title>Run complete</Card.Title>
        <Card.Description>
          Every page now reads this run's results.
          {amber ? ` ${amber} stage${amber === 1 ? '' : 's'} need${amber === 1 ? 's' : ''} attention; see the stages below.` : ''}
        </Card.Description>
      </Card.Header>
      <Card.Actions>
        {RESULT_LINKS.map(([label, page]) => (
          <button key={page} className="btn btn-sm" onClick={() => onGo(page)}>{label}</button>
        ))}
      </Card.Actions>
    </Card>
  );
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadRefusal(e) {
  if (e?.status === 401) return 'Sign in again to download the transformed tables.';
  if (e?.status === 403) return `Download refused. ${extractMessage(e)}`;
  if (e?.status === 404) return 'Nothing to download yet: run the pipeline with registers first.';
  return `The download failed. ${extractMessage(e)}`;
}

function StagedPanel({ staged, items, running, onChanged }) {
  const [askClear, setAskClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const months = staged?.months || [];
  const unapplied = staged?.unapplied || [];
  const arrivals = months.reduce((n, m) => n + (m.arrivals || 0), 0);

  const onDownload = async () => {
    setNote(null);
    setBusy(true);
    try {
      // Fetch all four first, so a refusal saves nothing.
      const blobs = [];
      for (const id of TRANSFORMED_IDS) blobs.push([id, await api.pipeline.transformed(id)]);
      // Saved under the slot file names, so they can be dropped straight back in.
      for (const [id, blob] of blobs) {
        const hint = items.find((it) => it.schema.id === id)?.schema.source_filename_hint || `${id}.csv`;
        saveBlob(blob, hint);
      }
      setNote({ level: 'ok', text: 'Downloaded the four transformed tables under the names the drop zone accepts.' });
    } catch (e) {
      setNote({ level: 'error', text: downloadRefusal(e) });
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setAskClear(false);
    setBusy(true);
    try {
      const r = await api.pipeline.clearStaged();
      setNote({ level: 'ok', text: `Cleared ${r.cleared} staged month${r.cleared === 1 ? '' : 's'}.` });
      await onChanged();
    } catch (e) {
      setNote({ level: 'error', text: extractMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="pl-staged">
      <Card.Header
        icon={<Icon name="file" size={16} />}
        chip={<Card.StatusChip tone={months.length ? 'loaded' : 'empty'}>{months.length} month{months.length === 1 ? '' : 's'}</Card.StatusChip>}
      >
        <Card.Title>Staged registers</Card.Title>
        <Card.Description>
          Staged files are held in memory until you clear them or the server restarts. A run uses
          them and keeps them, so the next run needs only the files that changed.
        </Card.Description>
      </Card.Header>
      <div className="pl-note">
        {months.length
          ? `${months[0].month} to ${months[months.length - 1].month}, ${arrivals.toLocaleString()} arrivals.`
          : 'No registers staged.'}
        {unapplied.length > 0 && (
          <> Not yet used by a run: <span className="tnum">{unapplied.slice(0, 6).join(', ')}{unapplied.length > 6 ? `, and ${unapplied.length - 6} more` : ''}</span>.</>
        )}
      </div>
      <Card.Actions>
        <button className="btn btn-sm" onClick={onDownload} disabled={busy}>
          <Icon name="download" size={12} /> Download transformed CSVs
        </button>
        <button className="btn btn-sm" onClick={() => setAskClear(true)} disabled={busy || running || !months.length}>
          <Icon name="logout" size={12} /> Clear
        </button>
      </Card.Actions>
      {askClear && (
        <div className="pl-confirm" role="group" aria-label="Confirm clearing staged months">
          <div>Clear all {months.length} staged months? They would need uploading again.</div>
          <Card.Actions>
            <button className="btn btn-primary btn-sm" onClick={onClear} autoFocus>Clear staged</button>
            <button className="btn btn-sm" onClick={() => setAskClear(false)}>Cancel</button>
          </Card.Actions>
        </div>
      )}
      {note && <div className="pl-note" data-level={note.level} role="status">{note.text}</div>}
    </Card>
  );
}

// ---- Tile -------------------------------------------------------------------

function DatasetTile({
  item, uploadState, selected, fetchAvailable, uploadOnly = false,
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
      ? { border: '1.5px solid var(--danger)' }
      : selected
        ? { border: '2px solid var(--brand)' }
        : { border: '1px solid var(--border)' };

  const background = isEmpty
    ? 'var(--surface-2)'
    : isError
      ? '#fef5f5'
      : selected
        ? '#f8fafc'
        : 'white';

  return (
    <Card
      onClick={loaded ? onSelect : undefined}
      style={{
        ...borderStyle,
        background,
        padding: 16,
        cursor: loaded ? 'pointer' : 'default',
        minHeight: 180,
      }}
    >
      <Card.Header
        icon={<Icon name={ICON_BY_ID[schema.id] || 'file'} size={16} />}
        chip={<StatusBadge state={state} loaded={loaded} schemaValid={loaded && metadata?.schema_valid} />}
      />

      <div style={{ minWidth: 0 }}>
        <Card.Title style={{ fontSize: 14, color: isEmpty ? '#475569' : undefined }}>
          {schema.label}
        </Card.Title>
        <Card.Description style={{ fontSize: 11, marginTop: 2, lineHeight: 1.4 }}>
          {schema.description}
        </Card.Description>
      </div>

      <div style={{ flex: 1 }} />

      {loaded && (
        <>
          <Card.MetricRow
            label={<Card.FileLabel>{metadata.filename}</Card.FileLabel>}
            value={`${metadata.rows.toLocaleString()} rows`}
            mono={false}
          />
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
          paddingTop: 10, borderTop: '1px dashed var(--border)',
          fontSize: 11, color: 'var(--text-4)', textAlign: 'center', minWidth: 0,
        }}>
          Expected file: <Card.FileLabel>{schema.source_filename_hint}</Card.FileLabel>
          <div style={{ marginTop: 2 }}>
            ~{schema.expected_rows_hint?.toLocaleString() || '—'} rows · key{schema.key_columns.length > 1 ? 's' : ''} <Card.FileLabel>{schema.key_columns.join(' + ')}</Card.FileLabel>
          </div>
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <Card.Actions>
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
            {!uploadOnly && (
              <button
                className="btn btn-primary btn-sm"
                onClick={onFetch}
                disabled={!fetchAvailable}
                title={fetchAvailable ? '' : 'Configure DATA_REPO + GITHUB_TOKEN in api/.env to enable Fetch'}
                style={{ flex: 1, justifyContent: 'center', opacity: fetchAvailable ? 1 : 0.55 }}
              >
                <Icon name="download" size={12} /> Fetch
              </button>
            )}
            <button
              className={uploadOnly ? 'btn btn-primary btn-sm' : 'btn btn-sm'}
              onClick={onUpload}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              <Icon name="upload" size={12} /> Upload CSV
            </button>
          </>
        )}
        </Card.Actions>
      </div>

      {isError && (
        <ErrorPanel
          uploadState={uploadState}
          targetLabel={schema.label}
          onSendToBestFit={onSendToBestFit}
        />
      )}
    </Card>
  );
}

function StatusBadge({ state, loaded, schemaValid }) {
  if (state === 'uploading') return <span className="tag tag-info" style={{ fontSize: 10 }}><span className="dot" /> Uploading</span>;
  if (state === 'error')     return <span className="tag tag-danger" style={{ fontSize: 10 }}><span className="dot" /> Wrong file</span>;
  if (!loaded)               return <span className="tag" style={{ fontSize: 10, background: '#f1f5f9', color: 'var(--text-3)' }}>Empty</span>;
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
            style={{ background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)', flexShrink: 0 }}
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
        fontSize: 11, fontWeight: 700, color: 'var(--brand)',
        textTransform: 'uppercase', letterSpacing: 1.2,
      }}>{kicker}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
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

        <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'auto', maxHeight: 360 }}>
          <div className="table-scroll" role="region" tabIndex={0} aria-label="Data table (scrolls sideways on small screens)"><table className="tbl">
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
          </table></div>
        </div>

        <div className="grid-kpi" style={{ marginTop: 16 }}>
          <KpiTile label="Total rows" value={metadata.rows.toLocaleString()} color="var(--text)" />
          <KpiTile
            label="Expected rows"
            value={metadata.expected_rows_hint?.toLocaleString() || '—'}
            color="#475569"
          />
          <KpiTile
            label="Missing required"
            value={metadata.missing_required?.length || 0}
            color={(metadata.missing_required?.length || 0) === 0 ? 'var(--success)' : 'var(--danger)'}
          />
          <KpiTile
            label="Extra columns"
            value={metadata.extra_columns?.length || 0}
            color={(metadata.extra_columns?.length || 0) === 0 ? 'var(--success)' : 'var(--warning)'}
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
    <div style={{ padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--divider)', borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
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
