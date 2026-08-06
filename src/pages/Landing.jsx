import { useState } from 'react';
import Icon from '../components/Icon';
import HeroMotion from '../components/HeroMotion';

/* Marketing page. Every claim on this page must be TRUE of the product:
   see CLAUDE.md (AI governance: no accuracy percentages) and the landing
   correction plan. Mobile-first: layout classes live in styles.css (lp-*).

   DISCLOSURE DISCIPLINE: this page describes outcomes and guarantees, never
   technique. No method names, no algorithm names, no pipeline-stage names,
   no enumerated data-source lists, no accuracy-metric names. Technical
   detail lives behind auth in the admin view only. Before adding any new
   copy, ask: could a competitor use this sentence to narrow down how we do
   it? If yes, rewrite it as an outcome. */

const BRAND = '#0d9488';      // single brand accent (teal/cyan family)
const BRAND_LIGHT = '#7dd3fc';
const ALERT = '#dc2626';      // single alert colour

const DEPARTMENTS = [
  { id: 'ed', label: 'Emergency', peakLabel: 'Peak: Thu', days: [59, 66, 71, 77, 65, 55, 50], total: 443, plan: 'fair roster needs 2 locum shifts Thu, reorder 2 supply items' },
  { id: 'theatre', label: 'Theatre', peakLabel: 'Peak: Wed', days: [18, 22, 27, 24, 21, 12, 9], total: 133, plan: 'fair roster covers Wed with existing staff, no locum needed' },
  { id: 'outpatient', label: 'Outpatient', peakLabel: 'Peak: Mon', days: [96, 84, 78, 74, 70, 40, 30], total: 472, plan: 'fair roster needs 1 extra clerk Monday, no supply changes' },
];

export default function Landing({ onNavigate }) {
  const [dept, setDept] = useState('ed');
  const activeDept = DEPARTMENTS.find((d) => d.id === dept) || DEPARTMENTS[0];
  const WALKTHROUGH_MAILTO = 'mailto:jonathan@jlwanalytics.com?subject=Walkthrough%20request&body=Hi%20Jonathan%2C%0A%0AI%27d%20like%20to%20book%20a%2020-minute%20walkthrough%20of%20HealthForecast%20AI.%0A%0AHospital%2Forganisation%3A%0APreferred%20times%3A%0A';

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
        {/* Video kept at reduced opacity with a grid overlay so it reads as
            texture, not a competing visual system with the product mockup. */}
        <HeroMotion opacity={0.28} src="/videos/hero.mp4" poster="/videos/hero.jpg" />
        <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.12, pointerEvents: 'none' }}>
          <defs>
            <pattern id="lp-grid" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="#7dd3fc" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#lp-grid)" />
        </svg>

        <div className="lp-grid2" style={{ maxWidth: 1320, margin: '0 auto', position: 'relative' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'rgba(125,211,252,0.15)', border: '1px solid rgba(125,211,252,0.35)', borderRadius: 999, fontSize: 11, fontWeight: 600, color: BRAND_LIGHT, letterSpacing: 0.4, marginBottom: 24, maxWidth: '100%' }}>
              <span style={{ width: 6, height: 6, background: BRAND_LIGHT, borderRadius: '50%', flexShrink: 0 }} />
              HOSPITAL DEMAND FORECASTING PLATFORM
            </div>
            <h1 className="lp-h1">
              Spend less on last-minute staffing.<br />
              <span style={{ background: `linear-gradient(90deg, ${BRAND_LIGHT}, #5eead4)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Order supplies you actually need.
              </span>
            </h1>
            <p className="lp-sub" style={{ color: '#cbd5e1', maxWidth: 540, margin: '0 0 32px 0' }}>
              HealthForecast AI predicts patient demand from your hospital's own history,
              turns it into a fair roster and a costed order list, and shows the Rand
              figure before you approve anything.
            </p>
            <div style={{ display: 'flex', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
              <button onClick={() => onNavigate('welcome')} style={{ padding: '14px 28px', background: 'white', color: '#0f1729', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 24px rgba(0,0,0,0.2)', minHeight: 44 }}>
                Start your forecast
              </button>
              <a href={WALKTHROUGH_MAILTO} style={{ padding: '14px 28px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                Book a 20-minute walkthrough
              </a>
            </div>

            {/* Predict -> Decide -> Explain: promoted from footnote text to a
                prominent visual. Outcome words, not method words. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
              {['Predict', 'Decide', 'Explain'].map((w, i) => (
                <div key={w} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(125,211,252,0.1)', border: '1px solid rgba(125,211,252,0.3)', borderRadius: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND_LIGHT, flexShrink: 0 }} />
                    <span style={{ fontSize: 'clamp(1rem, 2.4vw, 1.2rem)', fontWeight: 700, letterSpacing: '-0.3px', color: 'white' }}>{w}</span>
                  </div>
                  {i < 2 && <span style={{ padding: '0 12px', color: BRAND_LIGHT, fontSize: 18, opacity: 0.8 }} aria-hidden="true">&rarr;</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Hero product mockup - numbers match the real app's scale */}
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
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Next 7 days &middot; total arrivals</div>
                    <div style={{ fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 600, marginTop: 2, letterSpacing: '-0.5px' }}>443 <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}>patients</span></div>
                  </div>
                  <div style={{ padding: '4px 10px', background: '#fef5f5', color: ALERT, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Peak: Thu</div>
                </div>
                <svg viewBox="0 0 320 100" width="100%" height="100" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lg-hero" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0" stopColor={BRAND} stopOpacity="0.3" />
                      <stop offset="1" stopColor={BRAND} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64 L 320 100 L 0 100 Z" fill="url(#lg-hero)" />
                  <path d="M0 80 L 32 72 L 64 68 L 96 60 L 128 54 L 160 48" stroke="#475569" strokeWidth="2" fill="none" />
                  <path d="M160 48 L 192 36 L 224 24 L 256 32 L 288 50 L 320 64" stroke={BRAND} strokeWidth="2" fill="none" />
                  <line x1="160" y1="0" x2="160" y2="100" stroke="#cbd5e1" strokeDasharray="2 2" />
                  <text x="164" y="14" fontSize="9" fill="#64748b">Forecast &rarr;</text>
                </svg>
                <div className="lp-days" style={{ marginTop: 12 }}>
                  {[59, 66, 71, 77, 65, 55, 50].map((v, i) => {
                    const isPeak = i === 3;
                    return (
                      <div key={i} style={{ padding: 5, borderRadius: 4, textAlign: 'center', background: isPeak ? '#fef5f5' : 'white', border: '1px solid ' + (isPeak ? '#fecaca' : '#eef0f3'), minWidth: 0 }}>
                        <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isPeak ? ALERT : '#0f172a', margin: '1px 0' }}>{v}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 9, color: '#64748b', marginTop: 6 }}>Each day carries a likely range. Plan with the range, not the point.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: '#f0f5fa', borderRadius: 4, fontSize: 11 }}>
                  <span style={{ color: '#1e6091', fontWeight: 600 }}>&#8599; Plan:</span> fair roster needs 2 locum shifts Thu, reorder 2 supply items
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PROBLEM STRIP - statistics demoted to sourced footnotes, cards lead with the cost */}
      <div className="lp-pad" style={{ paddingTop: 'clamp(48px, 8vw, 80px)', paddingBottom: 'clamp(48px, 8vw, 80px)', background: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 6vw, 56px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>The problem</div>
            <h2 className="lp-h2" style={{ maxWidth: 880, marginInline: 'auto', marginBottom: 16 }}>
              Every hour of guesswork has a price.
            </h2>
            <p className="lp-sub" style={{ color: '#475569', maxWidth: 640, margin: '0 auto' }}>
              Thursday arrives busier than planned. You are seven nurses short by 14:00,
              so you call an agency at premium rates, and by month end nobody can say
              what it cost.
            </p>
          </div>
          <div className="lp-cards3">
            {[
              { t: 'The premium you pay for being surprised', d: 'Agency cover booked at short notice costs multiples of a planned shift.', f: 'Nationally this runs past R1.5bn a year in SA public health (SAMJ).' },
              { t: 'The stock you order twice', d: 'Ordering on last month’s usage means overstock in one ward and empty shelves in another.', f: '400+ stockouts logged across 72 facilities in a single province in two months (Stop Stockouts Project).' },
              { t: 'The decision nobody can explain', d: 'When the roster is questioned, there is no record of why it was built that way.', f: 'One in four public emergency-service posts sits vacant, so every rostered hour has to be justified (national EMS statistics).' },
            ].map((s) => (
              <div key={s.t} style={{ padding: 'clamp(20px, 4vw, 32px)', background: '#fafbfc', borderRadius: 12, borderLeft: `3px solid ${ALERT}` }}>
                <div style={{ fontSize: 'clamp(1.1rem, 2.6vw, 1.3rem)', fontWeight: 600, color: '#0f172a', letterSpacing: '-0.3px', lineHeight: 1.3, marginBottom: 10 }}>{s.t}</div>
                <div style={{ fontSize: 14, color: '#475569', lineHeight: 1.55, marginBottom: 14 }}>{s.d}</div>
                <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.5, paddingTop: 12, borderTop: '1px solid #eef0f3' }}>{s.f}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* HOW IT WORKS - hospital's point of view only, no internal pipeline stages named */}
      <div id="section-platform" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)', background: 'linear-gradient(180deg, #fafbfc 0%, #f0f5fa 100%)' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 6vw, 64px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>How it works</div>
            <h2 className="lp-h2" style={{ marginBottom: 16 }}>From your data to a decision you can defend.</h2>
          </div>

          <div className="lp-steps">
            {[
              { n: 1, t: 'Load your history', d: 'Bring your existing arrival records in the format you already have. No integration project, no IT queue. The platform handles the preparation.', icon: 'upload' },
              { n: 2, t: 'Get the plan, not just the number', d: 'A fair, lawful roster and a costed reorder list for every forecast day, with a likely range for each day rather than a single guess.', icon: 'forecast' },
              { n: 3, t: 'Ask why, then act', d: 'The AI analyst explains any figure in plain language. Export the report, or email the alert to the ward manager before the shortfall happens.', icon: 'bolt' },
            ].map((s) => (
              <div key={s.n} style={{ position: 'relative', textAlign: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: 'white', border: `2px solid ${BRAND}`, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: BRAND, boxShadow: '0 4px 16px rgba(13,148,136,0.14)' }}>
                  <Icon name={s.icon} size={24} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Step {s.n}</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TRUST */}
      <div id="section-models" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(56px, 9vw, 100px)', background: 'linear-gradient(180deg, #0f1729 0%, #1e3a5f 100%)', color: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          {/* "What this means for you" promoted to a full-width lead panel
              rather than a side box - it carries the strongest copy on the page. */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 'clamp(20px, 4vw, 36px)', marginBottom: 'clamp(28px, 5vw, 48px)' }}>
            <div style={{ fontSize: 12, color: BRAND_LIGHT, marginBottom: 18, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>What this means for you</div>
            <div className="lp-cards3">
              {[
                ['Plain-language AI analyst', 'Ask what changed and why, get a straight answer, no jargon.'],
                ['Costed to the Rand', 'Every staffing and supply recommendation shows its price before you act.'],
                ['Zero data science required', 'You need the outcome, not the model. The platform handles the rest.'],
              ].map(([n, sub]) => (
                <div key={n}>
                  <div style={{ fontSize: 15, color: 'white', fontWeight: 700, marginBottom: 8 }}>{n}</div>
                  <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-grid2">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: BRAND_LIGHT, textTransform: 'uppercase', marginBottom: 12 }}>Built for trust</div>
              <h2 className="lp-h2" style={{ marginBottom: 20 }}>Built from your hospital's own patterns.</h2>
              <p className="lp-sub" style={{ color: '#cbd5e1', margin: 0 }}>
                The platform learns from your hospital's own history and is validated
                against what actually happened before you rely on it. You can rerun that
                check yourself, on any past date, inside the app.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {['Validated before you rely on it', 'Fair, lawful rostering', 'Full audit trail'].map((c) => (
                <span key={c} style={{ padding: '10px 16px', background: 'rgba(15,23,41,0.55)', border: `1px solid ${BRAND_LIGHT}`, borderRadius: 999, fontSize: 13, fontWeight: 600, color: 'white' }}>{c}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* OUTCOMES */}
      <div id="section-outcomes" className="lp-pad" style={{ paddingTop: 'clamp(56px, 9vw, 100px)', paddingBottom: 'clamp(24px, 4vw, 40px)', background: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(32px, 6vw, 64px)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>Why hospitals choose this</div>
            <h2 className="lp-h2">Fewer surprises. Lower costs. Better care.</h2>
          </div>
          <div className="lp-cards3" style={{ marginBottom: 24 }}>
            {[
              { v: 'Move spend from panic rates to planned rates', l: 'See next month’s shortfall this week, while a normal shift still costs normal money. Short-notice agency cover carries a premium. Planning weeks ahead moves those shifts back to normal rates.' },
              { v: 'Stop ordering blind', l: 'Supply recommendations follow predicted demand, with the stockout risk priced next to the order cost, so you can see the trade-off before you commit.' },
              { v: 'Defend every decision', l: 'Every roster and order carries its reasoning and its Rand figure, with a full audit trail in plain English.' },
            ].map((s) => (
              <div key={s.v} style={{ padding: 'clamp(20px, 4vw, 32px)', background: '#fafbfc', borderRadius: 12, textAlign: 'center', border: '1px solid #eef0f3' }}>
                <div style={{ fontSize: 'clamp(1.1rem, 2.8vw, 1.35rem)', fontWeight: 600, color: BRAND, letterSpacing: '-0.3px', lineHeight: 1.3 }}>{s.v}</div>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 12, lineHeight: 1.55 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 13, color: '#334155', maxWidth: 640, margin: '0 auto', lineHeight: 1.6, padding: '18px 20px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10 }}>
            A hospital spending R2m a year on agency cover recovers R200,000 from a 10
            percent reduction. Load your own history and see whether that is reachable,
            before you commit to anything.
          </div>
        </div>
      </div>

      {/* NEW: report export + email alerts + AI analyst in action */}
      <div className="lp-pad" style={{ paddingTop: 'clamp(40px, 6vw, 72px)', paddingBottom: 'clamp(40px, 6vw, 72px)', background: 'white' }}>
        <div style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div className="lp-grid2" style={{ marginBottom: 'clamp(32px, 6vw, 56px)' }}>
            <div style={{ padding: 'clamp(20px, 4vw, 28px)', background: '#f0f5fa', borderRadius: 12, border: '1px solid #dbe7f2', minWidth: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e6091', marginBottom: 14 }}>
                <Icon name="file" size={20} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>One document, board-ready</div>
              <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
                Forecast, plan, cost and the reasoning behind it, in one document. What
                you put in front of a board.
              </div>
            </div>
            <div style={{ padding: 'clamp(20px, 4vw, 28px)', background: '#f0f5fa', borderRadius: 12, border: '1px solid #dbe7f2', minWidth: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e6091', marginBottom: 14 }}>
                <Icon name="bell" size={20} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>The warning before the shift</div>
              <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6 }}>
                The ward manager gets the alert before the shift, not the invoice after it.
              </div>
            </div>
          </div>

          {/* AI analyst in action - styled mock exchange, business language only */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>The AI analyst, in action</div>
            <h2 className="lp-h2" style={{ marginBottom: 0 }}>Ask it a question. Get a straight answer.</h2>
          </div>
          <div style={{ maxWidth: 640, margin: '0 auto', background: '#0f1729', borderRadius: 14, padding: 'clamp(18px, 3vw, 26px)' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
              <div style={{ background: '#1e3a5f', color: 'white', padding: '10px 16px', borderRadius: '12px 12px 2px 12px', fontSize: 13.5, maxWidth: '80%' }}>
                Why is Thursday's roster costing more than usual?
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: 'rgba(125,211,252,0.12)', border: '1px solid rgba(125,211,252,0.3)', color: '#e2f4fb', padding: '12px 16px', borderRadius: '12px 12px 12px 2px', fontSize: 13.5, lineHeight: 1.6, maxWidth: '88%' }}>
                Thursday is forecast at 77 arrivals, above the weekly average. Your
                current roster covers it with 2 locum shifts at R4,180. Booking those
                shifts now, instead of on the day, keeps the cost at the planned rate.
              </div>
            </div>
          </div>

          {/* Department generality - proven with a real interface, not claimed */}
          <div style={{ marginTop: 'clamp(48px, 8vw, 80px)' }}>
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, color: '#1e6091', textTransform: 'uppercase', marginBottom: 12 }}>Not just Emergency</div>
              <h2 className="lp-h2" style={{ marginBottom: 12 }}>The same interface, any department.</h2>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
              {DEPARTMENTS.map((d) => (
                <button key={d.id} onClick={() => setDept(d.id)} style={{
                  padding: '9px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${dept === d.id ? BRAND : '#e4e7eb'}`,
                  background: dept === d.id ? BRAND : 'white',
                  color: dept === d.id ? 'white' : '#475569',
                }}>{d.label}</button>
              ))}
            </div>
            <div style={{ maxWidth: 520, margin: '0 auto', background: 'white', border: '1px solid #eef0f3', borderRadius: 12, padding: 'clamp(14px, 3vw, 20px)', boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Next 7 days &middot; total arrivals</div>
                  <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2 }}>{activeDept.total} <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>patients</span></div>
                </div>
                <div style={{ padding: '4px 10px', background: '#fef5f5', color: ALERT, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{activeDept.peakLabel}</div>
              </div>
              <div className="lp-days">
                {activeDept.days.map((v, i) => {
                  const isPeak = v === Math.max(...activeDept.days);
                  return (
                    <div key={i} style={{ padding: 5, borderRadius: 4, textAlign: 'center', background: isPeak ? '#fef5f5' : '#fafbfc', border: '1px solid ' + (isPeak ? '#fecaca' : '#eef0f3'), minWidth: 0 }}>
                      <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase' }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isPeak ? ALERT : '#0f172a', margin: '1px 0' }}>{v}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#f0f5fa', borderRadius: 4, fontSize: 11 }}>
                <span style={{ color: '#1e6091', fontWeight: 600 }}>&#8599; Plan:</span> {activeDept.plan}
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: '#475569', marginTop: 20, maxWidth: 480, marginInline: 'auto' }}>
              Bring your arrival history. The same forecast, roster and cost logic fits
              any department.
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="lp-pad" style={{
        position: 'relative',
        paddingTop: 'clamp(48px, 8vw, 84px)', paddingBottom: 'clamp(48px, 8vw, 84px)',
        background: 'linear-gradient(110deg, #0f1729 0%, #1e5b8a 60%, #14545c 100%)',
        color: 'white', textAlign: 'center', overflow: 'hidden',
      }}>
        <HeroMotion opacity={0.35} src="/videos/cta.mp4" poster="/videos/cta.jpg" />
        <div style={{ maxWidth: 700, margin: '0 auto', position: 'relative' }}>
          <h2 className="lp-h1" style={{ marginBottom: 20 }}>See it on your own data.</h2>
          <p className="lp-sub" style={{ color: '#cbd5e1', margin: '0 0 36px 0' }}>
            A pilot starts with your own history: load your arrival counts and see
            the forecast for your hospital before anything changes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onNavigate('welcome')} style={{ padding: '16px 32px', background: 'white', color: '#0f1729', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>Start your forecast</button>
            <a href={WALKTHROUGH_MAILTO} style={{ padding: '16px 32px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 44, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Book a 20-minute walkthrough</a>
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: '#cbd5e1' }}>POPIA-conscious by design: aggregate counts only, no patient records, data held in memory, never written to disk.</div>
        </div>
      </div>

      {/* Footer - real links, real people */}
      <div className="lp-pad" style={{ background: '#0a1120', color: '#94a3b8', paddingTop: 48, paddingBottom: 32 }}>
        <div className="lp-foot" style={{ maxWidth: 1320, margin: '0 auto' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'linear-gradient(135deg, #2f86c4, #0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'white' }}>HF</div>
              <div style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>HealthForecast AI</div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>
              Forecast-to-decision support for hospitals. Built by
              Jonathan Lukwichi, JLW Analytics.
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
            <div style={{ fontSize: 13, padding: '5px 0' }}>Validated before you rely on it</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>Fair, lawful staffing rules</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>Costed supply recommendations</div>
          </div>
          <div>
            <div style={{ color: 'white', fontSize: 12, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.8 }}>Contact</div>
            <a href={WALKTHROUGH_MAILTO} style={{ display: 'block', fontSize: 13, padding: '5px 0', color: '#94a3b8', textDecoration: 'none' }}>Book a walkthrough</a>
            <div style={{ fontSize: 13, padding: '5px 0' }}>jlwanalytics.com</div>
            <div style={{ fontSize: 13, padding: '5px 0' }}>South Africa</div>
          </div>
        </div>
        <div style={{ maxWidth: 1320, margin: '32px auto 0', paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>&copy; 2026 JLW Analytics. All rights reserved.</div>
          <div>Made for South African hospitals. POPIA-conscious design.</div>
        </div>
      </div>
    </div>
  );
}
