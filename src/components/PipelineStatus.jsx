import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

/* One read of GET /api/pipeline/status per page visit, shared by everything in
   the app shell: the results gate, the header data note and the sidebar
   badges. The last answer is kept while a new page's
   read is in flight, so moving between pages never flashes empty.

   results_ready is the server's word on whether a finished pipeline run has
   produced results; nothing in the shell shows a result before it. */

const PipelineStatusContext = createContext(null);

export function PipelineStatusProvider({ routeKey, children }) {
  const [state, setState] = useState({ status: null, error: false });

  const refresh = useCallback(() => api.pipeline.status()
    .then((s) => { setState({ status: s, error: false }); return s; })
    .catch((e) => { setState((prev) => ({ ...prev, error: true })); throw e; }), []);

  useEffect(() => { refresh().catch(() => {}); }, [routeKey, refresh]);

  const setStatus = useCallback((s) => setState({ status: s, error: false }), []);
  const value = useMemo(() => ({ ...state, refresh, setStatus }), [state, refresh, setStatus]);
  return <PipelineStatusContext.Provider value={value}>{children}</PipelineStatusContext.Provider>;
}

/* { status, error, refresh, setStatus }. Outside a provider (a page rendered
   on its own) it reads the status once itself. */
export function usePipelineContext() {
  const ctx = useContext(PipelineStatusContext);
  const [own, setOwn] = useState({ status: null, error: false });
  useEffect(() => {
    if (ctx) return undefined;
    let alive = true;
    api.pipeline.status()
      .then((s) => { if (alive) setOwn({ status: s, error: false }); })
      .catch(() => { if (alive) setOwn({ status: null, error: true }); });
    return () => { alive = false; };
  }, [ctx]);
  return ctx || { ...own, refresh: () => Promise.resolve(own.status), setStatus: () => {} };
}

// The stage the run is on, in words, for anyone waiting on it.
export function runProgress(status) {
  if (!status?.running) return null;
  if (status.loading) return 'Loading the sample data…';
  const stages = status.stages || [];
  const i = stages.findIndex((s) => s.status === 'running');
  if (i < 0) return 'Starting the run…';
  return `Running step ${i + 1} of ${stages.length}: ${stages[i].label}`;
}
