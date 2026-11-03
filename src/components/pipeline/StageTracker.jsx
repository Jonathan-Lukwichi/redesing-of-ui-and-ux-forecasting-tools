import Card from '../ui/Card';

// The status chip for each stage. Tones map onto the Card.StatusChip palette.
const STATUS = {
  pending: { tone: 'empty', text: 'Waiting' },
  running: { tone: 'info', text: 'Running' },
  done:    { tone: 'valid', text: 'Done' },
  skipped: { tone: 'empty', text: 'Skipped' },
  amber:   { tone: 'missing', text: 'Needs attention' },
  failed:  { tone: 'error', text: 'Failed' },
};

function when(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function seconds(s) {
  if (s == null) return null;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

/** The eight pipeline stages: status, time taken and a one-line receipt each. */
export default function StageTracker({ status, error }) {
  const stages = status?.stages || [];
  const started = when(status?.started_at);
  const finished = when(status?.finished_at);
  let sub = 'No run yet. Upload the files, then press Run full pipeline.';
  if (status?.running) sub = `Running since ${started}. You can leave this page; the run continues.`;
  else if (finished) sub = `Last run ${started} to ${finished}.`;

  return (
    <Card className="pl-tracker">
      <Card.Header>
        <Card.Title>Pipeline stages</Card.Title>
        <Card.Description>{error ? 'The run status could not be loaded. Is the server running?' : sub}</Card.Description>
      </Card.Header>
      <ol className="pl-stages" aria-live="polite">
        {stages.map((s, i) => {
          const st = STATUS[s.status] || STATUS.pending;
          return (
            <li key={s.id} className="pl-stage" data-status={s.status}>
              <span className="pl-stage-num tnum" aria-hidden="true">{i + 1}</span>
              <div className="pl-stage-main">
                <div className="pl-stage-head">
                  <span className="pl-stage-label">{s.label}</span>
                  <Card.StatusChip tone={st.tone}>{st.text}</Card.StatusChip>
                  {seconds(s.seconds) && <span className="pl-stage-time tnum">{seconds(s.seconds)}</span>}
                </div>
                {s.receipt && <div className="pl-stage-receipt">{s.receipt}</div>}
                {!!s.warnings?.length && (
                  <ul className="pl-stage-warnings">
                    {s.warnings.map((w, j) => <li key={j}>{w}</li>)}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
