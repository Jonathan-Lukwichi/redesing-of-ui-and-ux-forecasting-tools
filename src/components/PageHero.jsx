/* Page banner: pure brand treatment (gradient + subtle chart motif).
   The `image` prop is accepted for backward compatibility but deliberately
   ignored - photo banners were unlicensed stock comps and are gone. */
export default function PageHero({ title, sub, image, actions, kicker }) {
  return (
    <div style={{
      position: 'relative',
      minHeight: 'clamp(120px, 14vw, 200px)',
      borderRadius: 'clamp(8px, 1vw, 14px)',
      overflow: 'hidden',
      background: 'linear-gradient(110deg, #0f1729 0%, #1e3a5f 55%, #14545c 100%)',
      color: 'white',
      padding: 'clamp(16px, 2.5vw, 36px) clamp(16px, 3vw, 44px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
      {/* Decorative grid + forecast motif (brand, not stock) */}
      <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.35, pointerEvents: 'none' }}
        viewBox="0 0 600 200" preserveAspectRatio="xMaxYMid slice">
        {Array.from({ length: 12 }).map((_, i) => (
          <line key={'h' + i} x1="0" x2="600" y1={i * 20} y2={i * 20} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        {Array.from({ length: 24 }).map((_, i) => (
          <line key={'v' + i} y1="0" y2="200" x1={i * 26} x2={i * 26} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d="M300 150 C 360 138, 400 148, 440 118 S 520 70, 600 84 L 600 200 L 300 200 Z" fill="rgba(13,148,136,0.14)" />
        <path d="M300 150 C 360 138, 400 148, 440 118 S 520 70, 600 84" fill="none" stroke="rgba(94,234,212,0.5)" strokeWidth="2" />
        <path d="M300 168 C 370 160, 420 166, 470 146 S 550 110, 600 116" fill="none" stroke="rgba(125,211,252,0.3)" strokeWidth="1.5" strokeDasharray="5 4" />
        <circle cx="520" cy="88" r="4" fill="#5eead4" />
      </svg>

      <div style={{ position: 'relative' }}>
        {kicker && (
          <div style={{
            fontSize: 'clamp(10px, 0.8vw, 13px)',
            fontWeight: 700,
            letterSpacing: 1.2,
            color: '#7dd3fc',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
            {kicker}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 'min(100%, 220px)' }}>
            <h1 style={{
              margin: 0,
              fontSize: 'clamp(20px, 2.5vw, 36px)',
              fontWeight: 700,
              letterSpacing: '-0.5px',
              lineHeight: 1.2,
            }}>{title}</h1>
            {sub && (
              <div style={{
                fontSize: 'clamp(12px, 1.1vw, 15px)',
                color: '#cbd5e1',
                marginTop: 8,
                lineHeight: 1.6,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{sub}</div>
            )}
          </div>
          {actions && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
