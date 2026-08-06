import HeroMotion from '../components/HeroMotion';

export default function Welcome({ onNavigate }) {
  return (
    <div className="lp-page" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      {/* Left: branding */}
      <div className="lp-pad" style={{
        background: 'linear-gradient(160deg, #0f1729 0%, #1e3a5f 60%, #1e6091 100%)',
        paddingTop: 40, paddingBottom: 40,
        color: 'white',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        <HeroMotion opacity={0.5} src="/videos/login.mp4" poster="/videos/login.jpg" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 2 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #2f86c4, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>HF</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>HealthForecast AI</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Hospital demand forecasting platform</div>
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: '#7dd3fc', textTransform: 'uppercase', marginBottom: 12 }}>Forecast-to-decision platform</div>
          <h1 className="lp-h2" style={{ marginBottom: 16, color: 'white' }}>
            Forecast patient demand.<br />
            <span style={{ color: '#7dd3fc' }}>Plan staff and supply with confidence.</span>
          </h1>
          <p className="lp-sub" style={{ color: '#cbd5e1', maxWidth: 460, margin: 0 }}>
            Patient arrivals forecast from real hospital history, turned into a fair
            staffing roster and a costed supply plan, explained in plain language by an AI analyst.
          </p>

          <div className="lp-stats" style={{ marginTop: 28, maxWidth: 460 }}>
            {[{ v: 'Forecast', l: 'Patient volume, weeks ahead' }, { v: 'Staff', l: 'Fair rosters, ready to use' }, { v: 'Supply', l: 'Costed reorder plans' }].map((s) => (
              <div key={s.l}>
                <div style={{ fontSize: 'clamp(1rem, 2.4vw, 1.25rem)', fontWeight: 600, color: 'white', letterSpacing: '-0.3px' }}>{s.v}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#64748b', position: 'relative', zIndex: 2 }}>© 2026 JLW Analytics · POPIA-conscious design</div>
      </div>

      {/* Right: login form */}
      <div className="lp-pad" style={{ background: 'white', paddingTop: 48, paddingBottom: 48, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 600, color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.3px' }}>Sign in</h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 28px 0' }}>Sign in to see your hospital's forecast.</p>

          <div className="field-group" style={{ marginBottom: 14 }}>
            <label className="label">Email</label>
            <input className="input" defaultValue="demo@healthforecast.local" />
          </div>
          <div className="field-group" style={{ marginBottom: 6 }}>
            <label className="label">Password</label>
            <input className="input" type="password" defaultValue="••••••••••••" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked /> Keep me signed in
            </label>
          </div>

          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onNavigate('dashboard')}>
            Sign in
          </button>

          <div style={{ marginTop: 28, padding: 14, background: '#f0f5fa', borderRadius: 8, fontSize: 12, color: '#334155' }}>
            <strong style={{ color: '#1e6091' }}>Try it now:</strong> sample credentials are already
            filled in, just click Sign in to explore the full platform.
          </div>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
            <span style={{ cursor: 'pointer', color: '#1e6091' }} onClick={() => onNavigate('landing')}>← Back to home</span>
          </div>
        </div>
      </div>
    </div>
  );
}
