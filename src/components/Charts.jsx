export function Sparkline({ data, color = '#1e6091', width = 80, height = 28, fill = true }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = width, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = path + ` L${w} ${h} L0 ${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function LineChart({ series, height = 220, xLabels, showGrid = true }) {
  const w = 720, h = height, pad = { l: 48, r: 16, t: 10, b: 30 };
  const allVals = series.flatMap((s) => s.data.filter((v) => v != null && v !== 0));
  const max = Math.max(...allVals) * 1.1;
  const min = Math.min(0, Math.min(...allVals));
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const n = series[0].data.length;
  const x = (i) => pad.l + (i / (n - 1)) * innerW;
  const y = (v) => pad.t + innerH - ((v - min) / (max - min)) * innerH;

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => min + (i / yTicks) * (max - min));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {showGrid && tickVals.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="#eef0f3" strokeWidth="1" />
          <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#94a3b8">{Math.round(v)}</text>
        </g>
      ))}
      {xLabels && xLabels.map((lbl, i) => (
        <text key={i} x={x(i * Math.floor((n - 1) / (xLabels.length - 1)))} y={h - 6} textAnchor="middle" fontSize="12" fill="#94a3b8">{lbl}</text>
      ))}
      {series.map((s, si) => {
        const validPts = s.data.map((v, i) => [i, v]).filter(([, v]) => v != null && v !== 0);
        if (validPts.length < 2) return null;
        const path = validPts.map(([i, v], pi) => (pi === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ');
        return (
          <g key={si}>
            {s.band && (
              <path
                d={
                  s.band.upper.map((v, i) => (i === 0 ? 'M' : 'L') + x(i) + ' ' + y(v)).join(' ') +
                  ' ' +
                  [...s.band.lower].reverse().map((v, i) => 'L' + x(s.band.lower.length - 1 - i) + ' ' + y(v)).join(' ') +
                  ' Z'
                }
                fill={s.color}
                opacity="0.14"
                stroke="none"
              />
            )}
            {s.dashed ? (
              <path d={path} fill="none" stroke={s.color} strokeWidth="2.5" strokeDasharray="5 4" />
            ) : (
              <path d={path} fill="none" stroke={s.color} strokeWidth="2.5" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ data, height = 200, color = '#1e6091', labels, valueFmt = (v) => v }) {
  const w = 720, h = height, pad = { l: 48, r: 16, t: 16, b: 30 };
  const max = Math.max(...data) * 1.15;
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const bw = (innerW / data.length) * 0.6;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - t)} y2={pad.t + innerH * (1 - t)} stroke="#eef0f3" />
      ))}
      {data.map((v, i) => {
        const cx = pad.l + (i + 0.5) * (innerW / data.length);
        const bh = (v / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={pad.t + innerH - bh} width={bw} height={bh} fill={color} rx="3" />
            <text x={cx} y={h - 6} textAnchor="middle" fontSize="12" fill="#94a3b8">{labels[i]}</text>
            <text x={cx} y={pad.t + innerH - bh - 6} textAnchor="middle" fontSize="12" fill="#334155" fontWeight="600">{valueFmt(v)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ data, size = 180, thickness = 28 }) {
  const r = size / 2, ri = r - thickness;
  const total = data.reduce((s, d) => s + d.value, 0);
  let a = -Math.PI / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {data.map((d, i) => {
        const frac = d.value / total;
        const a2 = a + frac * Math.PI * 2;
        const large = frac > 0.5 ? 1 : 0;
        const x1 = r + r * Math.cos(a), y1 = r + r * Math.sin(a);
        const x2 = r + r * Math.cos(a2), y2 = r + r * Math.sin(a2);
        const x3 = r + ri * Math.cos(a2), y3 = r + ri * Math.sin(a2);
        const x4 = r + ri * Math.cos(a), y4 = r + ri * Math.sin(a);
        const path = `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${large} 0 ${x4} ${y4} Z`;
        a = a2;
        return <path key={i} d={path} fill={d.color} />;
      })}
    </svg>
  );
}

export function Heatmap({ data, rows, cols, height = 200, max: maxProp }) {
  const w = 720, h = height, pad = { l: 68, r: 16, t: 12, b: 30 };
  const cellW = (w - pad.l - pad.r) / cols.length;
  const cellH = (h - pad.t - pad.b) / rows.length;
  const m = maxProp || Math.max(...data.flat());
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {rows.map((rl, ri) => (
        <text key={'r' + ri} x={pad.l - 8} y={pad.t + (ri + 0.65) * cellH} textAnchor="end" fontSize="12" fill="#64748b">{rl}</text>
      ))}
      {cols.map((cl, ci) => (
        <text key={'c' + ci} x={pad.l + (ci + 0.5) * cellW} y={h - 6} textAnchor="middle" fontSize="12" fill="#64748b">{cl}</text>
      ))}
      {data.map((row, ri) =>
        row.map((v, ci) => {
          const t = v / m;
          return (
            <rect key={ri + '-' + ci}
              x={pad.l + ci * cellW + 1}
              y={pad.t + ri * cellH + 1}
              width={cellW - 2}
              height={cellH - 2}
              fill={`rgba(30,96,145,${(0.12 + t * 0.8).toFixed(2)})`}
              rx="2"
            />
          );
        })
      )}
    </svg>
  );
}
