import { usePipelineContext } from './PipelineStatus';

/* Which run the data on screen came from, read from the shell's one
   pipeline-status read per page (PipelineStatus.jsx). A failed read renders
   nothing, so offline runs are unaffected.

   By Jonathan's decision (2026-11-11) no user-visible text labels the
   inventory and scheduling data by origin: the presenter says so in person.
   The yellow banner that used to live here is gone for that reason. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// "2 Nov 2026 14:05" in the browser's local time; null when unparseable.
export function formatStamp(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The header note: which run the results come from, or that there are none yet.
// Upload and sample runs read the same.
export function noteText(status) {
  if (!status) return null;
  if (!status.results_ready) return status.running ? 'Run in progress' : 'No data yet';
  const { source } = status;
  if (!source || source.mode === 'none' || source.run == null) return null;
  const stamp = formatStamp(source.finished_at);
  return `Run ${source.run}${stamp ? `, ${stamp}` : ''}`;
}

export function DataSourceNote() {
  const { status } = usePipelineContext();
  const text = noteText(status);
  if (!text) return null;
  return <span className="topbar-source" title="The pipeline run the data on screen comes from">{text}</span>;
}
