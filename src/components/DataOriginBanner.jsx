import { useEffect, useState } from 'react';
import { api } from '../api/client';

/* Where the data on screen came from. Status is read once per mount (no
   polling); a failed read renders nothing, so offline runs are unaffected. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// "2 Nov 2026 14:05" in the browser's local time; null when unparseable.
export function formatStamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Fetches pipeline status once per mount (and again when `key` changes).
export function usePipelineStatus(key) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    setStatus(null);
    api.pipeline.status()
      .then((s) => { if (alive) setStatus(s); })
      .catch(() => {});
    return () => { alive = false; };
  }, [key]);
  return status;
}

export function DataSourceNote({ routeKey }) {
  const status = usePipelineStatus(routeKey);
  if (!status?.source) return null;
  const { source } = status;
  const text = source.mode === 'uploaded'
    ? `Uploaded run ${source.run}${formatStamp(source.finished_at) ? `, ${formatStamp(source.finished_at)}` : ''}`
    : 'Default data';
  return <span className="topbar-source" title="Where the data on screen came from">{text}</span>;
}

export default function DataOriginBanner() {
  const status = usePipelineStatus('banner');
  if (!status || status.origin === 'real') return null;
  return (
    <div role="note" style={{
      background: 'var(--warning-soft, #fef3c7)', color: 'var(--text)',
      border: '1px solid var(--warning, #f59e0b)', borderRadius: 8,
      padding: '8px 12px', fontSize: 'var(--step--1, 13px)', lineHeight: 1.5,
    }}>
      Inventory and staffing are simulated demonstration data.
    </div>
  );
}
