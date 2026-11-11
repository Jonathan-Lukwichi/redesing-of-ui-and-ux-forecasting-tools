import { useEffect, useState } from 'react';
import Card from './ui/Card';
import Icon from './Icon';
import { api } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { isStepReady, readySteps, runProgress, usePipelineContext } from './PipelineStatus';

const POLL_MS = 2000;

export const STEP_LABEL = {
  arrivals: 'the patient-arrivals analysis',
  staff: 'the staff analysis',
  supply: 'the supply analysis',
  forecast: 'the prediction',
  optimise: 'the optimization',
  recommend: 'the recommendations',
};

function messageOf(err) {
  if (err?.detail && typeof err.detail === 'object' && err.detail.message) return err.detail.message;
  if (typeof err?.detail === 'string') return err.detail;
  return 'The server could not be reached. Try again in a moment.';
}

/* Results pages render only once their own step has finished on the server.
   Until then the page component is never mounted, so none of its data reads
   (overviews, AI calls) fire: this one card stands in for it. The sample run
   starts only when someone presses the button, never on load. */
export default function ResultsGate({ children, onNavigate, step = 'any' }) {
  const { status, error, refresh, setStatus } = usePipelineContext();
  const { can } = useSession();
  const [starting, setStarting] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [message, setMessage] = useState(null);

  const ready = isStepReady(status, step);
  const running = !!status?.running;

  // Follow a run (ours or anyone's) until it ends; the page appears when it is ready.
  useEffect(() => {
    if (ready || !running) return undefined;
    const timer = setInterval(() => { refresh().catch(() => {}); }, POLL_MS);
    return () => clearInterval(timer);
  }, [ready, running, refresh]);

  if (ready) return children;
  if (!status && !error) return <div className="content" aria-busy="true" />;

  const startSample = async (replace = false) => {
    setMessage(null);
    setConfirmReplace(false);
    setStarting(true);
    try {
      setStatus(await api.pipeline.sample({ replace }));
    } catch (e) {
      const code = e?.detail?.error;
      if (e.status === 409 && code === 'replace_uploaded') setConfirmReplace(true);
      else if (e.status === 409 && code === 'already_running') {
        setMessage('A run is already in progress. Its progress is shown here.');
        refresh().catch(() => {});
      } else setMessage(messageOf(e));
    } finally {
      setStarting(false);
    }
  };

  const failed = !running && status?.finished_at
    ? (status.stages || []).find((s) => s.status === 'failed') : null;
  const progress = runProgress(status);
  // Only when some other step already has results is it worth saying which one this page waits for.
  const stepHint = step !== 'any' && readySteps(status).length > 0 ? STEP_LABEL[step] : null;

  return (
    <div className="content">
      <Card className="results-gate" data-testid="results-gate">
        <Card.Header icon={<Icon name="upload" size={16} />}>
          <Card.Title>No results yet</Card.Title>
          <Card.Description>
            Upload your data on the Data Hub and run the pipeline. Results appear here after the run.
          </Card.Description>
        </Card.Header>
        {stepHint && (
          <div className="pl-note">
            This page appears once {stepHint} has run. Ask the assistant to run it, or run the full pipeline on the Data Hub.
          </div>
        )}
        {progress && <div className="pl-note" role="status" aria-live="polite">{progress}</div>}
        {failed && (
          <div className="pl-note" data-level="error" role="status">
            The last run stopped at {failed.label}. {failed.receipt}
          </div>
        )}
        {error && !status && (
          <div className="pl-note" data-level="error" role="status">
            The server could not be reached to check for results.
          </div>
        )}
        <Card.Actions>
          {can('data:write') && (
            <button type="button" className="btn" onClick={() => onNavigate?.('upload')}>
              <Icon name="upload" size={12} /> Go to the Data Hub
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={running || starting || confirmReplace}
            onClick={() => startSample(false)}>
            <Icon name="play" size={12} /> Use the sample data
          </button>
        </Card.Actions>
        {confirmReplace && (
          <div className="pl-confirm" role="group" aria-label="Confirm replacing the uploaded data">
            <div>
              <strong>Replace the uploaded data?</strong> The sample data takes the place of the
              files uploaded on the Data Hub and of any results made from them.
            </div>
            <Card.Actions>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => startSample(true)} autoFocus>
                Replace with the sample data
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmReplace(false)}>Cancel</button>
            </Card.Actions>
          </div>
        )}
        {message && <div className="pl-note" role="status">{message}</div>}
      </Card>
    </div>
  );
}
