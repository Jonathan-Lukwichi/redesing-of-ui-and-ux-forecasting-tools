export default function PageHero({ title, sub, image, actions, kicker }) {
  return (
    <div style={{
      position: 'relative',
      minHeight: 'clamp(140px, 14vw, 200px)',
      borderRadius: 'clamp(8px, 1vw, 14px)',
      overflow: 'hidden',
      background: image
        ? `linear-gradient(90deg, rgba(15,23,41,0.93) 0%, rgba(30,96,145,0.75) 55%, rgba(13,148,136,0.35) 100%), url(${image})`
        : 'linear-gradient(110deg, #0f1729 0%, #1e6091 100%)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      color: 'white',
      padding: 'clamp(20px, 2.5vw, 36px) clamp(24px, 3vw, 44px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      boxSizing: 'border-box',
    }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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
            }}>{sub}</div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
