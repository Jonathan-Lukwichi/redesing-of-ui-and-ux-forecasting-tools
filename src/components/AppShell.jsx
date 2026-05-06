import Icon from './Icon';

const NAV_ITEMS = [
  { section: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ]},
  { section: 'Data', items: [
    { id: 'upload', label: 'Data Hub', icon: 'upload' },
    { id: 'prepare', label: 'Prepare', icon: 'table' },
    { id: 'explore', label: 'Explore', icon: 'chart' },
  ]},
  { section: 'Modeling', items: [
    { id: 'baseline', label: 'Baselines', icon: 'flask' },
    { id: 'features', label: 'Feature Studio', icon: 'cpu' },
    { id: 'selection', label: 'Feature Selection', icon: 'filter' },
    { id: 'train', label: 'Train Models', icon: 'cpu' },
    { id: 'results', label: 'Results', icon: 'target' },
  ]},
  { section: 'Operations', items: [
    { id: 'forecast', label: 'Forecast', icon: 'forecast' },
    { id: 'staff', label: 'Staffing', icon: 'users', badge: '3' },
    { id: 'supply', label: 'Supply', icon: 'box' },
    { id: 'actions', label: 'Action Center', icon: 'bolt', badge: '12' },
  ]},
];

const CRUMB_MAP = {
  dashboard: ['Operations', 'Dashboard'],
  upload: ['Data', 'Data Hub'],
  prepare: ['Data', 'Prepare Data'],
  explore: ['Data', 'Explore Data'],
  baseline: ['Modeling', 'Baseline Models'],
  features: ['Modeling', 'Feature Studio'],
  selection: ['Modeling', 'Feature Selection'],
  train: ['Modeling', 'Train Models'],
  results: ['Modeling', 'Model Results'],
  forecast: ['Operations', 'Forecast'],
  staff: ['Planning', 'Staff Planner'],
  supply: ['Planning', 'Supply Planner'],
  actions: ['Operations', 'Action Center'],
};

function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">HF</div>
        <div>
          <div className="sidebar-brand-name">HealthForecast</div>
          <div className="sidebar-brand-sub">Memorial General Hospital</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map((sec) => (
          <div key={sec.section}>
            <div className="sidebar-section">{sec.section}</div>
            <nav className="sidebar-nav">
              {sec.items.map((it) => (
                <div
                  key={it.id}
                  className={'sidebar-item' + (it.id === active ? ' active' : '')}
                  onClick={() => onNavigate(it.id)}
                >
                  <span className="sidebar-item-icon"><Icon name={it.icon} size={15} /></span>
                  <span>{it.label}</span>
                  {it.badge && <span className="sidebar-item-badge">{it.badge}</span>}
                </div>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className="sidebar-footer-btn"
          onClick={() => onNavigate('landing')}
          title="Back to home page"
        >
          <Icon name="home" size={14} />
          <span>Home</span>
        </button>
        <button
          className="sidebar-footer-btn sidebar-footer-btn-danger"
          onClick={() => onNavigate('welcome')}
          title="Sign out"
        >
          <Icon name="logout" size={14} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [], onNavigate }) {
  return (
    <div className="topbar">
      <div className="topbar-crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'current' : ''}>{c}</span>
          </span>
        ))}
      </div>
      <div className="topbar-spacer" />
      <button
        className="topbar-signout"
        onClick={() => onNavigate('welcome')}
        title="Sign out"
      >
        <Icon name="logout" size={14} />
        Sign out
      </button>
    </div>
  );
}

export default function AppShell({ active = 'dashboard', onNavigate, children }) {
  const crumbs = CRUMB_MAP[active] || ['Dashboard'];
  return (
    <div className="app">
      <Sidebar active={active} onNavigate={onNavigate} />
      <div className="main">
        <Topbar crumbs={crumbs} onNavigate={onNavigate} />
        {children}
      </div>
    </div>
  );
}
