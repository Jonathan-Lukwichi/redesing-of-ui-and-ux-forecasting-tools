// ============================================================================
// PATCH for src/components/Charts.jsx
// Replace the existing `export function ActionPanel({ mechanism, action })`
// (around line 179) with the version below. It is BACKWARD-COMPATIBLE: all
// existing <ActionPanel mechanism={…} action={…}/> calls keep working
// unchanged. It ADDS a second mode — <ActionPanel title items={[…]} /> — used
// by the Headlines tab's closing checklist and reusable in every later tab.
// ============================================================================

export function ActionPanel({ mechanism, action, title, items }) {
  // --- Checklist mode: <ActionPanel title items={[{action, reason, priority}]} /> ---
  if (items && items.length) {
    const PRIORITY = {
      high:   { color: '#dc2626', bg: '#fef2f2', label: 'High' },
      medium: { color: '#d97706', bg: '#fffbeb', label: 'Medium' },
      low:    { color: '#0d9488', bg: '#ecfeff', label: 'Low' },
    };
    return (
      <div className="card" style={{ borderLeft: '3px solid #1e6091' }}>
        {title && (
          <div className="card-header">
            <div>
              <div className="card-title" style={{ fontFamily: SERIF, fontSize: 18 }}>{title}</div>
              <div className="card-sub">{items.length} actions · ordered by priority</div>
            </div>
          </div>
        )}
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => {
            const p = PRIORITY[it.priority] || PRIORITY.medium;
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '11px 14px', background: '#fafbfc',
                border: '1px solid #eef0f3', borderLeft: `3px solid ${p.color}`,
                borderRadius: 6,
              }}>
                <span style={{
                  flexShrink: 0, marginTop: 1, fontSize: 9, fontWeight: 700,
                  color: p.color, background: p.bg, border: `1px solid ${p.color}33`,
                  textTransform: 'uppercase', letterSpacing: 1, padding: '3px 7px',
                  borderRadius: 4, minWidth: 56, textAlign: 'center',
                }}>{p.label}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.4 }}>
                    {it.action}
                  </div>
                  {it.reason && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.45 }}>
                      {it.reason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Legacy mode: <ActionPanel mechanism={…} action={…} /> (unchanged) ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {mechanism && (
        <div style={{
          padding: '12px 14px', background: '#fafbfc',
          border: '1px solid #eef0f3', borderRadius: 8,
          fontSize: 12, color: '#475569', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
            Mechanism
          </div>
          {mechanism}
        </div>
      )}
      {action && (
        <div style={{
          padding: '12px 14px', background: '#ecfeff',
          border: '1px solid #a5f3fc', borderRadius: 8, borderLeft: '3px solid #0d9488',
          fontSize: 13, color: '#0f172a', lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
            Recommended action
          </div>
          {action}
        </div>
      )}
    </div>
  );
}
