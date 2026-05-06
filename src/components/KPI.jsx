import { Sparkline } from './Charts';

export default function KPI({ label, value, unit, foot, trend, trendDir = 'up', spark, sparkColor }) {
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
