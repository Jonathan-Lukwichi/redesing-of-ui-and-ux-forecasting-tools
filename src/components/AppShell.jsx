import Icon from './Icon';
import AskChat from './AskChat';

const NAV_ITEMS = [
  { section: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  ]},
  { section: 'Data', items: [
    { id: 'upload', label: 'Data Hub', icon: 'upload' },
    { id: 'prepare', label: 'Prepare', icon: 'table' },
    { id: 'explore', label: 'Explore', icon: 'chart' },
  ]},
  { section: 'Forecasting', items: [
    { id: 'forecast-total',     label: 'Total ED',     icon: 'forecast' },
    { id: 'forecast-specialty', label: 'By specialty', icon: 'chart' },
  ]},
  { section: 'Operations', items: [
    { id: 'staff',    label: 'Staffing',      icon: 'users', badge: '3' },
    { id: 'supply',   label: 'Supply',        icon: 'box' },
    { id: 'optimize', label: 'Optimization',  icon: 'bolt' },
    { id: 'actions',  label: 'Action Center', icon: 'bolt', badge: '12' },
  ]},
  { section: 'Governance', items: [
    { id: 'admin', label: 'Admin', icon: 'settings' },
  ]},
];

const CRUMB_MAP = {
  dashboard: ['Overview', 'Dashboard'],
  upload:    ['Data', 'Data Hub'],
  prepare:   ['Data', 'Prepare Data'],
  explore:   ['Data', 'Explore Data'],
  'forecast-total':     ['Forecasting', 'Total ED Arrivals'],
  'forecast-specialty': ['Forecasting', 'By Specialty'],
  staff:     ['Operations', 'Staff Planner'],
  supply:    ['Operations', 'Supply Planner'],
  optimize:  ['Operations', 'Optimization'],
  actions:   ['Operations', 'Action Center'],
  admin:     ['Governance', 'Admin & AI Governance'],
};

function Sidebar({ active, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">HF</div>
        <div>
          <div className="sidebar-brand-name">HealthForecast</div>
          <div className="sidebar-brand-sub">Hospital</div>
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
      <AskChat />
    </div>
  );
}
