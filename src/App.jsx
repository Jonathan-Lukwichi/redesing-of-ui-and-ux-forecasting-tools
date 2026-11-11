import { useState } from 'react';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import DataHub from './pages/DataHub';
import PrepareData from './pages/PrepareData';
import ExploreData from './pages/ExploreData';
import Task1Forecast from './pages/Task1Forecast';
import Task2Forecast from './pages/Task2Forecast';
import StaffPlanner from './pages/StaffPlanner';
import SupplyPlanner from './pages/SupplyPlanner';
import Optimization from './pages/Optimization';
import ActionCenter from './pages/ActionCenter';
import Admin from './pages/Admin';
import RequireScope from './auth/RequireScope';
import ResultsGate from './components/ResultsGate';

/* Each page names the scope it needs, so the guard and the sidebar read from
 * the same contract. Server-side enforcement is independent of both.
 * `gated` pages show results, so they mount only once a pipeline run has
 * finished (ResultsGate); until then they show one card asking for the data. */
const PAGES = {
  dashboard:            { C: Dashboard,     scope: 'forecast:read', gated: true },
  upload:               { C: DataHub,       scope: 'data:write' },
  prepare:              { C: PrepareData,   scope: 'data:write' },
  explore:              { C: ExploreData,   scope: 'data:read', gated: true },
  'forecast-total':     { C: Task1Forecast, scope: 'forecast:read', gated: true },
  'forecast-specialty': { C: Task2Forecast, scope: 'forecast:read', gated: true },
  staff:                { C: StaffPlanner,  scope: 'staff:read', gated: true },
  supply:               { C: SupplyPlanner, scope: 'supply:read', gated: true },
  optimize:             { C: Optimization,  anyScope: ['staff:read', 'supply:read'], gated: true },
  actions:              { C: ActionCenter,  scope: 'actions:read', gated: true },
  admin:                { C: Admin,         scope: 'admin' },
};

// Deep-linking: /#dashboard, /#staff, ... open that page directly.
function readHash() {
  const h = typeof window !== 'undefined' ? window.location.hash.slice(1) : '';
  return h && (PAGES[h] || h === 'landing' || h === 'welcome') ? h : 'landing';
}

export default function App() {
  const [page, setPageState] = useState(readHash);
  const setPage = (p) => {
    setPageState(p);
    try { window.location.hash = p; } catch { /* ignore */ }
  };

  if (page === 'landing') return <Landing onNavigate={setPage} />;
  if (page === 'welcome') return <Welcome onNavigate={setPage} />;

  const entry = PAGES[page] || PAGES.dashboard;
  const PageComponent = entry.C;

  return (
    <AppShell active={page} onNavigate={setPage}>
      <RequireScope scope={entry.scope} anyScope={entry.anyScope}>
        {entry.gated
          ? <ResultsGate key={page} onNavigate={setPage}><PageComponent onNavigate={setPage} /></ResultsGate>
          : <PageComponent onNavigate={setPage} />}
      </RequireScope>
    </AppShell>
  );
}
