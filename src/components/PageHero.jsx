export default function PageHero({ title, sub, image, actions, kicker, height = 190 }) {
  return (
    <div style={{
      position: 'relative',
      height,
      borderRadius: 14,
      overflow: 'hidden',
      background: image
        ? `linear-gradient(90deg, rgba(15,23,41,0.93) 0%, rgba(30,96,145,0.75) 55%, rgba(13,148,136,0.35) 100%), url(${image})`
        : 'linear-gradient(110deg, #0f1729 0%, #1e6091 100%)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      color: 'white',
      padding: '32px 40px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      marginBottom: 4,
    }}>
      {kicker && (
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.2, color: '#7dd3fc', textTransform: 'uppercase', marginBottom: 8 }}>
          {kicker}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.15 }}>{title}</h1>
          {sub && <div style={{ fontSize: 15, color: '#cbd5e1', marginTop: 10, maxWidth: 760, lineHeight: 1.6 }}>{sub}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}
