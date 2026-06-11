export default function Welcome({ onNavigate }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '100vh' }}>
      {/* Left — branding */}
      <div style={{
        background: `linear-gradient(160deg, rgba(15,23,41,0.92) 0%, rgba(30,58,95,0.85) 60%, rgba(30,96,145,0.7) 100%), url(/images/login-bg1.jpg)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        padding: '48px 56px',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 2 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #2f86c4, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>HF</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>HealthForecast AI</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Hospital Demand Intelligence</div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: '#7dd3fc', textTransform: 'uppercase', marginBottom: 12 }}>Hospital Operations Platform</div>
          <h1 style={{ fontSize: 36, fontWeight: 600, lineHeight: 1.2, margin: '0 0 16px 0', letterSpacing: '-0.5px' }}>
            Forecast patient demand.<br />
            <span style={{ color: '#7dd3fc' }}>Plan staff and supply with confidence.</span>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#cbd5e1', maxWidth: 460, margin: 0 }}>
            End-to-end ML forecasting for all hospital departments — from raw data to optimized weekly schedules and supply orders.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 32, maxWidth: 460 }}>
            {[{ v: '96%', l: 'Forecast accuracy' }, { v: '23%', l: 'Overtime reduction' }, { v: '7d', l: 'Forward horizon' }].map((s) => (
              <div key={s.l}>
                <div style={{ fontSize: 24, fontWeight: 600, color: 'white', letterSpacing: '-0.5px' }}>{s.v}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#64748b', position: 'relative', zIndex: 2 }}>© 2026 HealthForecast AI · HIPAA-compliant</div>

        <svg style={{ position: 'absolute', right: -40, top: 80, opacity: 0.08 }} width="500" height="500" viewBox="0 0 500 500">
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={'h' + i} x1="0" x2="500" y1={i * 25} y2={i * 25} stroke="white" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={'v' + i} y1="0" y2="500" x1={i * 25} x2={i * 25} stroke="white" strokeWidth="0.5" />
          ))}
          <path d="M0 350 L 100 320 L 200 280 L 300 200 L 400 240 L 500 100" fill="none" stroke="#7dd3fc" strokeWidth="2" />
          <path d="M0 380 L 100 360 L 200 340 L 300 280 L 400 300 L 500 220" fill="none" stroke="#0d9488" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      </div>

      {/* Right — login form */}
      <div style={{ background: 'white', padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>Sign in to your hospital</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px 0' }}>Use your hospital credentials. SSO available for enterprise plans.</p>

          <div className="field-group" style={{ marginBottom: 14 }}>
            <label className="label">Email</label>
            <input className="input" defaultValue="s.mitchell@memorialgeneral.org" />
          </div>
          <div className="field-group" style={{ marginBottom: 6 }}>
            <label className="label">Password</label>
            <input className="input" type="password" defaultValue="••••••••••••" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked /> Keep me signed in
            </label>
            <a style={{ fontSize: 12, color: '#1e6091', textDecoration: 'none', cursor: 'pointer' }}>Forgot password?</a>
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('dashboard')}>
            Sign in
          </button>

          <div style={{ marginTop: 28, padding: 14, background: '#f0f5fa', borderRadius: 8, fontSize: 12, color: '#334155' }}>
            <strong style={{ color: '#1e6091' }}>Demo mode</strong> — Click Sign in with the prefilled credentials to explore as Operations Director.
          </div>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            <span style={{ cursor: 'pointer', color: '#1e6091' }} onClick={() => onNavigate('landing')}>← Back to home</span>
          </div>
        </div>
      </div>
    </div>
  );
}
