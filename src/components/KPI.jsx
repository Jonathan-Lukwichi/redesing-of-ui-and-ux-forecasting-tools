import { Sparkline } from './Charts';

export default function KPI({ label, value, unit, foot, trend, trendDir = 'up', spark, sparkColor, loading }) {
  if (loading) {
    return (
      <div className="kpi">
        <div className="kpi-label">{label}</div>
        <div className="skel" style={{ width: '70%', height: 12, margin: '10px 0' }} />
        <div className="skel" style={{ width: '92%', height: 30 }} />
      </div>
    );
  }
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        <span>{value}</span>
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-foot">
        {trend && (
          <span className={'chip chip-' + trendDir}>
            {trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→'} {trend}
          </span>
        )}
        {foot}
      </div>
      {spark && (
        <div className="kpi-spark">
          <Sparkline data={spark} color={sparkColor} />
        </div>
      )}
    </div>
  );
}
