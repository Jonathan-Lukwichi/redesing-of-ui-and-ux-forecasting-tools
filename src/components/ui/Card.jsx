/* Canonical card system. The ONLY card implementation for new and migrated
   pages: layout classes live in styles.css (CARD SYSTEM section). Desktop
   visuals intentionally match the legacy .card look (surface, border, radius,
   type sizes), because this is a responsive repair, not a redesign. */

export function CardGrid({ minItemWidth = 280, columns, children, style, className = '' }) {
  return (
    <div
      className={`ui-cardgrid ${className}`}
      data-cols={columns || undefined}
      style={{ '--card-min': typeof minItemWidth === 'number' ? `${minItemWidth}px` : minItemWidth, ...style }}
    >
      {children}
    </div>
  );
}

export default function Card({ children, dashed, tone, style, className = '' }) {
  return (
    <div className={`ui-card ${dashed ? 'ui-card-dashed' : ''} ${className}`} data-tone={tone || undefined} style={style}>
      {children}
    </div>
  );
}

Card.Header = function CardHeader({ icon, chip, children }) {
  return (
    <div className="ui-card-header">
      {icon && <div className="ui-card-icon">{icon}</div>}
      <div className="ui-card-header-main">{children}</div>
      {chip && <div className="ui-card-header-chip">{chip}</div>}
    </div>
  );
};

Card.Title = function CardTitle({ children, style }) {
  return <div className="ui-card-title" style={style}>{children}</div>;
};

Card.Description = function CardDescription({ children, clamp, style }) {
  const clampStyle = clamp
    ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
    : undefined;
  return <div className="ui-card-desc" style={{ ...clampStyle, ...style }}>{children}</div>;
};

/* Filenames like pure_hourly_arrival.csv have no natural break point:
   overflow-wrap anywhere is what keeps them inside the card. */
Card.FileLabel = function CardFileLabel({ children, style }) {
  return <span className="ui-card-file" style={style}>{children}</span>;
};

const CHIP_TONES = {
  valid: 'tag-success', merged: 'tag-success', loaded: 'tag-success',
  empty: '', missing: 'tag-warning', error: 'tag-danger', info: 'tag-info',
};

Card.StatusChip = function CardStatusChip({ tone = 'empty', children }) {
  return <span className={`tag ${CHIP_TONES[tone] || ''} ui-card-chip`}>{children}</span>;
};

Card.MetricRow = function CardMetricRow({ label, value, valueColor, mono = true }) {
  return (
    <div className="ui-card-metric">
      <span className="ui-card-metric-label">{label}</span>
      <span className={`ui-card-metric-value ${mono ? 'mono' : ''} tnum`} style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  );
};

Card.SourceRow = function CardSourceRow({ name, ok, okText = 'loaded', missingText = 'not loaded', extra }) {
  return (
    <div className="ui-card-source" data-ok={ok ? '1' : '0'}>
      <span className="ui-card-source-name mono">{name}</span>
      <span className="ui-card-source-state tnum">{ok ? `✓ ${extra ?? okText}` : `✕ ${missingText}`}</span>
    </div>
  );
};

Card.Actions = function CardActions({ children }) {
  return <div className="ui-card-actions">{children}</div>;
};
