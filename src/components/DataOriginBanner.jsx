import { usePipelineContext } from './PipelineStatus';

/* Where the data on screen came from, read from the shell's one pipeline-status
   read per page (PipelineStatus.jsx). A failed read renders nothing, so offline
   runs are unaffected. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// "2 Nov 2026 14:05" in the browser's local time; null when unparseable.
export function formatStamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const RUN_LABEL = { uploaded: 'Uploaded run', sample: 'Sample data run' };

// The header note: which run the results come from, or that there are none yet.
export function noteText(status) {
  if (!status) return null;
  if (!status.results_ready) return status.running ? 'Run in progress' : 'No data yet';
  const { source } = status;
  const label = RUN_LABEL[source?.mode];
  if (!label) return null;
  const stamp = formatStamp(source.finished_at);
  return `${label} ${source.run}${stamp ? `, ${stamp}` : ''}`;
}

export function DataSourceNote() {
  const { status } = usePipelineContext();
  const text = noteText(status);
  if (!text) return null;
  return <span className="topbar-source" title="Where the data on screen came from">{text}</span>;
}

export default function DataOriginBanner() {
  const { status } = usePipelineContext();
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
