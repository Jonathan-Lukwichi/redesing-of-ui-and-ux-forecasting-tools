export default function PageHero({ title, sub, image, actions, kicker, height = 160 }) {
  return (
    <div style={{
      position: 'relative',
      height,
      borderRadius: 12,
      overflow: 'hidden',
      background: image
        ? `linear-gradient(90deg, rgba(15,23,41,0.92) 0%, rgba(30,96,145,0.72) 55%, rgba(13,148,136,0.35) 100%), url(${image})`
        : 'linear-gradient(110deg, #0f1729 0%, #1e6091 100%)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      color: 'white',
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      marginBottom: 4,
    }}>
      {kicker && (
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: '#7dd3fc', textTransform: 'uppercase', marginBottom: 6 }}>
          {kicker}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: 1.15 }}>{title}</h1>
          {sub && <div style={{ fontSize: 14, color: '#cbd5e1', marginTop: 8, maxWidth: 720, lineHeight: 1.5 }}>{sub}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}
