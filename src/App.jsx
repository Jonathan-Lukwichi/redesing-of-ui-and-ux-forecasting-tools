import { useState } from 'react';
import AppShell from './components/AppShell';
import Landing from './pages/Landing';
import Welcome from './pages/Welcome';
import Dashboard from './pages/Dashboard';
import DataHub from './pages/DataHub';
import PrepareData from './pages/PrepareData';
import ExploreData from './pages/ExploreData';
import Forecast from './pages/Forecast';
import StaffPlanner from './pages/StaffPlanner';
import SupplyPlanner from './pages/SupplyPlanner';
import ActionCenter from './pages/ActionCenter';

const PAGES = {
  dashboard: Dashboard,
  upload: DataHub,
  prepare: PrepareData,
  explore: ExploreData,
  forecast: Forecast,
  staff: StaffPlanner,
  supply: SupplyPlanner,
  actions: ActionCenter,
};

export default function App() {
  const [page, setPage] = useState('landing');

  if (page === 'landing') return <Landing onNavigate={setPage} />;
  if (page === 'welcome') return <Welcome onNavigate={setPage} />;

  const PageComponent = PAGES[page] || Dashboard;

  return (
    <AppShell active={page} onNavigate={setPage}>
      <PageComponent onNavigate={setPage} />
    </AppShell>
  );
}
