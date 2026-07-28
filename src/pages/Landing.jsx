import Icon from '../components/Icon';
import HeroMotion from '../components/HeroMotion';

/* Marketing page. Every claim on this page must be TRUE of the product:
   see CLAUDE.md (AI governance: no accuracy percentages) and the landing
   correction plan. Mobile-first: layout classes live in styles.css (lp-*). */
export default function Landing({ onNavigate }) {
  return (
    <div className="lp-page" style={{ background: '#fafbfc', color: '#0f172a', fontFamily: 'Inter, system-ui, sans-serif', overflowY: 'auto' }}>

      {/* Top nav */}
      <div className="lp-pad" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10,
        paddingTop: 14, paddingBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        color: 'white', background: 'rgba(15,23,41,0.72)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'linear-gradient(135deg, #2f86c4, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white', flexShrink: 0 }}>HF</div>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>HealthForecast AI</div>
        </div>
        <div className="lp-nav-links">
          {[['Platform', 'section-platform'], ['Trust', 'section-models'], ['Outcomes', 'section-outcomes']].map(([l, id]) => (
            <a key={l} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })} style={{ color: 'rgba(255,255,255,0.85)', textDecoration: 'none', cursor: 'pointer' }}>{l}</a>
          ))}
        </div>
        <button onClick={() => onNavigate('welcome')} style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', minHeight: 40 }}>Sign in</button>
      </div>

      {/* HERO */}
      <div className="lp-pad" style={{
        position: 'relative',
        background: 'linear-gradient(115deg, #0f1729 0%, #1e3a5f 50%, #14545c 100%)',
        color: 'white',
        paddingTop: 'clamp(96px, 16vw, 150px)', paddingBottom: 'clamp(48px, 8vw, 90px)',
        overflow: 'hidden',
      }}>
        <HeroMotion opacity={0.5} src="/videos/hero.mp4" poster="/videos/hero.jpg" />

        <div className="lp-grid2" style={{ maxWidth: 1320, margin: '0 auto', position: 'relative' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(125,211,252,0.15)', border: '1px solid rgba(125,211,252,0.35)', borderRadius: 999, fontSize: 11, fontWeight: 600, color: '#7dd3fc', letterSpacing: 0.4, marginBottom: 24, maxWidth: '100%' }}>
              <span style={{ width: 6, height: 6, background: '#7dd3fc', borderRadius: '50%', flexShrink: 0 }} />
              HOSPITAL DEMAND FORECASTING PLATFORM
            </div>
            <h1 className="lp-h1">
              Your hospital's demand forecast.<br />
              <span style={{ background: 'linear-gradient(90deg, #7dd3fc, #5eead4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Staffing and supply, planned to match.
              </span>
            </h1>
            <p className="lp-sub" style={{ color: '#cbd5e1', maxWidth: 540, margin: '0 0 32px 0' }}>
              Predict patient volume for your hospital, then turn the forecast into
              a fair staffing roster and a costed supply plan — with an AI analyst
              that explains every number in plain language.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
              <button onClick={() => onNavigate('welcome')} style={{ padding: '14px 28px', background: 'white', color: '#0f1729', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', minHeight: 44 }}>
                Start your forecast
              </button>
            </div>

            <div className="lp-stats" style={{ paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              {[['Forecast', 'Patient volume, weeks ahead'], ['Staff', 'Fair rosters, ready to use'], ['Supply', 'Costed reorder plans'], ['AI analyst', 'Explains every number']].map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontSize: 'clamp(1.1rem, 2.8vw, 1.4rem)', fontWeight: 600, letterSpacing: '-0.4px' }}>{v}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero product mockup — numbers match the real app's scale */}
          <div style={{ position: 'relative', minWidth: 0 }}>
            <div style={{
              background: 'white', borderRadius: 12, padding: 'clamp(10px, 2vw, 18px)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
              color: '#0f172a',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                {['#fc6058', '#fdbc40', '#34c749'].map((c) => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />)}
                <div style={{ flex: 1, minWidth: 0, height: 22, background: '#f0f2f5', borderRadius: 4, marginLeft: 8, display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: 10, color: '#94a3b8', overflow: 'hidden', whiteSpace: 'nowrap' }}>healthforecast.jlwanalytics.com</div>
              </div>
              <div style={{ background: '#fafbfc', borderRadius: 6, padding: 'clamp(8px, 2vw, 14px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Next 7 days · total arrivals</div>
                    <div style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 600, marginTop: 2, letterSpacing: '-0.5px' }}>443 <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}>patients</span></div>
                  </div>
                  <div style={{ padding: '4px 10px', background: '#fef5f5', color: '#dc2626', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Peak: Thu</div>
                </div>
                <svg viewBox="0 0 320 100" width="100%" height="100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lg-hero" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor="#0d9488" stopOpacity="0.3" />
                      <stop offset="1" stopColor="#0d9488" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64 L 320 100 L 0 100 Z" fill="url(#lg-hero)" />
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48" stroke="#475569" strokeWidth="2" fill="none" />
                  <path d="M160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64" stroke="#0d9488" strokeWidth="2" fill="none" />
                  <line x1="160" y1="0" x2="160" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                  <text x="164" y="14" fontSize="9" fill="#64748b">Forecast →</text>
                </svg>
                <div className="lp-days" style={{ marginTop: 12 }}>
                  {[59, 66, 71, 77, 65, 55, 50].map((v, i) => {
                    const isPeak = i === 3;
                    return (
                      <div key={i} style={{ padding: 5, borderRadius: 4, textAlign: 'center', background: isPeak ? '#fef5f5' : 'white', border: '1px solid ' + (isPeak ? '#fecaca' : '#eef0f3'), minWidth: 0 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isPeak ? '#dc2626' : '#0f172a', margin: '1px 0' }}>{v}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 6 }}>Each day carries a likely range — plan with the range, not the point.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: '#f0f5fa', borderRadius: 4, fontSize: 11 }}>
                  <span style={{ color: '#1e6091', fontWeight: 600 }}>↗ Plan:</span> fair roster needs 2 locum shifts Thu · reorder 2 supply items
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PROBLEM STRIP — real, citable South African figures */}
      <div className="lp-pad" style={{ paddingTop: 'clamp(48px, 8vw, 80px)', paddingBottom: 'clamp(48px, 8vw, 80px)', background: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 6vw, 56px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>The problem</div>
            <h2 className="lp-h2" style={{ maxWidth: 880, marginInline: 'auto' }}>
              Planning by gut feel is the most expensive system a hospital runs.
            </h2>
          </div>
          <div className="lp-cards3">
            {[
              { v: 'R1.5bn+', l: 'Spent per year on agency nursing in SA public health — the cost of reactive, last-minute staffing', c: '#dc2626' },
              { v: '400+', l: 'Medicine stockouts recorded across 72 facilities in a single province in two months', c: '#d97706' },
              { v: '1 in 4', l: 'Public emergency-service posts vacant — every rostered hour has to count', c: '#dc2626' },
            ].map((s) => (
              <div key={s.l} style={{ padding: 'clamp(20px, 4vw, 32px)', background: '#fafbfc', borderRadius: 12, borderLeft: `3px solid ${s.c}` }}>
                <div style={{ fontSize: 'clamp(1.8rem, 5vw, 2.75rem)', fontWeight: 600, color: s.c, letterSpacing: '-1px', lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 14, color: '#475569', marginTop: 12, lineHeight: 1.5 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 }}>Figures from South African public-health reporting (SAMJ; Stop Stockouts Project; national EMS statistics).</div>
        </div>
      </div>

      {/* PIPELINE — the app's real five stages */}
      <div id="section-platform" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)', background: 'linear-gradient(180deg, #fafbfc 0%, #f0f5fa 100%)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 6vw, 64px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
            <h2 className="lp-h2" style={{ marginBottom: 16 }}>From data to decisions, in five clear steps.</h2>
            <p className="lp-sub" style={{ color: '#475569', maxWidth: 720, margin: '0 auto' }}>
              Load your data, run a forecast, get a plan. Every step is visible, every
              recommendation shows its cost, and a human approves every action.
            </p>
          </div>

          <div className="lp-steps">
            {[
              { n: 1, t: 'Ingest', d: 'Load arrivals, clinical, calendar and weather data as simple CSV files — no integration project needed', icon: 'upload', c: '#1e6091' },
              { n: 2, t: 'Prepare', d: 'The system builds one clean, ready-to-use table for each question (daily, hourly, by specialty)', icon: 'table', c: '#1e6091' },
              { n: 3, t: 'Learn', d: 'The system learns your hospital\'s patterns and checks itself against real history before you rely on it', icon: 'cpu', c: '#0d9488' },
              { n: 4, t: 'Forecast', d: 'Plan a week, a month or a quarter ahead, aware of SA public holidays, with a likely range for every day', icon: 'forecast', c: '#0d9488' },
              { n: 5, t: 'Act', d: 'A fair staffing roster and a costed supply plan — with the Rand savings shown before you commit', icon: 'bolt', c: '#0d9488' },
            ].map((s) => (
              <div key={s.n} style={{ position: 'relative', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: 'white', border: `2px solid ${s.c}`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.c, boxShadow: '0 4px 16px rgba(30,96,145,0.12)' }}>
                  <Icon name={s.icon} size={24} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: s.c, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Step {s.n}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ENGINES */}
      <div id="section-models" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)', background: 'linear-gradient(180deg, #0f1729 0%, #1e3a5f 100%)', color: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div className="lp-grid2">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#7dd3fc', textTransform: 'uppercase', marginBottom: 12 }}>Built for trust</div>
              <h2 className="lp-h2" style={{ marginBottom: 20 }}>Built from your hospital's own patterns.</h2>
              <p className="lp-sub" style={{ color: '#cbd5e1', margin: '0 0 28px 0' }}>
                The system learns from your hospital's own history, and checks itself
                against real outcomes before you rely on it. You can rerun that check
                yourself, on any past date, right in the app.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['Checks itself against real history', 'Likely ranges on every day', 'SA-holiday aware', 'Fair, lawful rostering', 'Smart supply planning', 'Plain-language AI analyst', 'Full audit trail'].map((c) => (
                  <span key={c} style={{ padding: '6px 12px', background: 'rgba(125,211,252,0.1)', border: '1px solid rgba(125,211,252,0.25)', borderRadius: 999, fontSize: 12, color: '#7dd3fc' }}>{c}</span>
                ))}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 'clamp(16px, 3vw, 24px)', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>What this means for you</div>
              {[
                ['Plain-language AI analyst', 'Ask what changed and why — get a straight answer, no jargon'],
                ['Costed to the Rand', 'Every staffing and supply recommendation shows its price before you act'],
                ['Zero data science required', 'You need the outcome, not the model — the platform handles the rest'],
              ].map(([n, sub]) => (
                <div key={n} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 13, color: 'white', fontWeight: 600, marginBottom: 6 }}>{n}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{sub}</div>
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 14, lineHeight: 1.5 }}>
                Full technical detail, including accuracy metrics, lives in the admin view.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EVIDENCE */}
      <div id="section-outcomes" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)', background: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 6vw, 64px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>Why hospitals choose this</div>
            <h2 className="lp-h2">Fewer surprises. Lower costs. Better care.</h2>
          </div>
          <div className="lp-cards3" style={{ marginBottom: 24 }}>
            {[
              { v: 'Cut agency & overtime spend', l: 'Plan staffing weeks in advance instead of scrambling for last-minute cover', c: '#0d9488' },
              { v: 'Prevent stockouts', l: 'Order supplies based on predicted demand, not last month\'s guesswork', c: '#1e6091' },
              { v: 'See the cost before you commit', l: 'Every staffing and supply recommendation is priced — compare scenarios instantly', c: '#0d9488' },
            ].map((s) => (
              <div key={s.l} style={{ padding: 'clamp(20px, 4vw, 32px)', background: '#fafbfc', borderRadius: 12, textAlign: 'center', border: '1px solid #eef0f3' }}>
                <div style={{ fontSize: 'clamp(1.15rem, 3vw, 1.5rem)', fontWeight: 600, color: s.c, letterSpacing: '-0.4px', lineHeight: 1.25 }}>{s.v}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 12, lineHeight: 1.55 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>Everything above reflects what the platform does today — not what it might do someday.</div>
        </div>
      </div>

      {/* CTA */}
      <div className="lp-pad" style={{
        position: 'relative',
        paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)',
        background: 'linear-gradient(110deg, #0f1729 0%, #1e5b8a 60%, #14545c 100%)',
        color: 'white', textAlign: 'center', overflow: 'hidden',
      }}>
        <HeroMotion opacity={0.4} src="/videos/cta.mp4" poster="/videos/cta.jpg" />
        <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative' }}>
          <h2 className="lp-h1" style={{ marginBottom: 20 }}>See it on your own data.</h2>
          <p className="lp-sub" style={{ color: '#cbd5e1', margin: '0 0 36px 0' }}>
            A pilot starts with your own history: load your arrival counts and see
            the forecast for your hospital before anything changes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('welcome')} style={{ padding: '16px 32px', background: 'white', color: '#0f1729', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>Sign in to plan ahead</button>
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: '#94a3b8' }}>POPIA-conscious by design: aggregate counts only — no patient records, data held in memory, never written to disk.</div>
        </div>
      </div>

      {/* Footer — real links, real people */}
      <div className="lp-pad" style={{ background: '#0a1120', color: '#94a3b8', paddingTop: 48, paddingBottom: 32 }}>
        <div className="lp-foot" style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(135deg, #2f86c4, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white' }}>HF</div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>HealthForecast AI</div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>
              Forecast-to-decision support for hospitals. Built by
              Jonathan Lukwichi · JLW Analytics.
            </div>
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Platform</div>
            {[['Sign in', 'welcome'], ['Forecasting', 'welcome'], ['Staffing & supply', 'welcome'], ['AI analyst', 'welcome']].map(([l, page]) => (
              <div key={l} onClick={() => onNavigate(page)} style={{ fontSize: 13, padding: '5px 0', cursor: 'pointer' }}>{l}</div>
            ))}
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Trust</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>Built from real hospital data</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>Fair, lawful staffing rules</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>Costed supply recommendations</div>
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Contact</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>jlwanalytics.com</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>South Africa</div>
          </div>
        </div>
        <div style={{ maxWidth: 1320, margin: '32px auto 0', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>© 2026 JLW Analytics. All rights reserved.</div>
          <div>Made for South African hospitals · POPIA-conscious design</div>
        </div>
      </div>
    </div>
  );
}
