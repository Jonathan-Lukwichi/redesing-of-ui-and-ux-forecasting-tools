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
      <div className="sidebar-footer">
        <div className="sidebar-avatar">SM</div>
        <div>
          <div className="sidebar-user-name">Dr. Sarah Mitchell</div>
          <div className="sidebar-user-role">Operations Director</div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [] }) {
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
      <div className="topbar-search-wrap">
        <Icon name="search" size={14} />
        <input className="topbar-search" placeholder="Search dashboards, models, datasets…" />
      </div>
      <button className="topbar-action"><Icon name="bell" size={16} /></button>
      <button className="topbar-action"><Icon name="settings" size={16} /></button>
    </div>
  );
}

export default function AppShell({ active = 'dashboard', onNavigate, children }) {
  const crumbs = CRUMB_MAP[active] || ['Dashboard'];
  return (
    <div className="app">
      <Sidebar active={active} onNavigate={onNavigate} />
      <div className="main">
        <Topbar crumbs={crumbs} />
        {children}
      </div>
    </div>
  );
}
