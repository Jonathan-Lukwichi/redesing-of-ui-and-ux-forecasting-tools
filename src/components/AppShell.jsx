import { useEffect, useState } from 'react';
import Icon from './Icon';
import AskChat from './AskChat';

const MOBILE_QUERY = '(max-width: 820px)';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.matchMedia(MOBILE_QUERY).matches; } catch { return false; }
  });
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

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

function ToggleBtn({ collapsed, onToggle }) {
  return (
    <button onClick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        border: 0, cursor: 'pointer', fontFamily: 'inherit',
        background: 'rgba(255,255,255,0.12)', color: 'inherit',
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, lineHeight: 1,
      }}>{collapsed ? '»' : '«'}</button>
  );
}

function Sidebar({ active, onNavigate, collapsed, onToggle, mobileOpen }) {
  return (
    <aside className={'sidebar' + (mobileOpen ? ' mobile-open' : '')}>
      <div className="sidebar-brand" style={collapsed
        ? { padding: '18px 0', justifyContent: 'center' }
        : { justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div className="sidebar-brand-mark">HF</div>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-brand-name">HealthForecast</div>
              <div className="sidebar-brand-sub">Hospital</div>
            </div>
          </div>
        )}
        <ToggleBtn collapsed={collapsed} onToggle={onToggle} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV_ITEMS.map((sec) => (
          <div key={sec.section}>
            {collapsed ? <div style={{ height: 12 }} /> : <div className="sidebar-section">{sec.section}</div>}
            <nav className="sidebar-nav">
              {sec.items.map((it) => (
                <div
                  key={it.id}
                  className={'sidebar-item' + (it.id === active ? ' active' : '')}
                  onClick={() => onNavigate(it.id)}
                  title={collapsed ? it.label : undefined}
                  style={collapsed ? { justifyContent: 'center', padding: '11px 0', position: 'relative' } : undefined}
                >
                  <span className="sidebar-item-icon"><Icon name={it.icon} size={15} /></span>
                  {!collapsed && <span>{it.label}</span>}
                  {!collapsed && it.badge && <span className="sidebar-item-badge">{it.badge}</span>}
                  {collapsed && it.badge && (
                    <span style={{ position: 'absolute', top: 6, right: 12, width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
                  )}
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
          style={collapsed ? { justifyContent: 'center' } : undefined}
        >
          <Icon name="home" size={14} />
          {!collapsed && <span>Home</span>}
        </button>
        <button
          className="sidebar-footer-btn sidebar-footer-btn-danger"
          onClick={() => onNavigate('welcome')}
          title="Sign out"
          style={collapsed ? { justifyContent: 'center' } : undefined}
        >
          <Icon name="logout" size={14} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

function Topbar({ crumbs = [], onNavigate, onMenu }) {
  return (
    <div className="topbar">
      <button className="topbar-menu-btn" onClick={onMenu} aria-label="Open menu" title="Menu">
        <Icon name="menu" size={18} />
      </button>
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
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('hf_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggle = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem('hf_sidebar_collapsed', next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const navigate = (id) => {
    setMobileOpen(false);
    onNavigate(id);
  };
  return (
    <div className="app" style={isMobile ? undefined : {
      gridTemplateColumns: collapsed ? '72px 1fr' : 'minmax(220px, 280px) 1fr',
      transition: 'grid-template-columns .18s ease',
    }}>
      <Sidebar
        active={active}
        onNavigate={navigate}
        collapsed={isMobile ? false : collapsed}
        onToggle={isMobile ? () => setMobileOpen(false) : toggle}
        mobileOpen={mobileOpen}
      />
      {isMobile && mobileOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
      )}
      <div className="main">
        <Topbar crumbs={crumbs} onNavigate={navigate} onMenu={() => setMobileOpen(true)} />
        {children}
      </div>
      <AskChat />
    </div>
  );
}
