import { aqiColor, aqiCategory } from '../services/api';

/**
 * SVG-based AQI Gauge (arc needle gauge)
 */
export default function AQIGauge({ value, size = 180 }) {
  const aqi  = value || 0;
  const cat  = aqiCategory(aqi);
  const color = aqiColor(aqi);
  const max   = 500;

  // Arc params
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r  = size * 0.38;
  const startAngle = -210;
  const endAngle   = 30;
  const range      = endAngle - startAngle;
  const pct        = Math.min(aqi / max, 1);
  const needleAngle = startAngle + pct * range;

  function polarToXY(angle, radius) {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  }

  // Arc path
  function arcPath(start, end, rr) {
    const s = polarToXY(start, rr);
    const e = polarToXY(end, rr);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  // Needle
  const needle = polarToXY(needleAngle, r * 0.82);
  const needleBase1 = polarToXY(needleAngle + 90, 5);
  const needleBase2 = polarToXY(needleAngle - 90, 5);

  // Zone arcs (Good, Satisfactory, Moderate, Poor, Very Poor, Severe)
  const zones = [
    { from: startAngle, to: startAngle + range * (50/500),  color: '#10B981' },
    { from: startAngle + range * (50/500),  to: startAngle + range * (100/500), color: '#84CC16' },
    { from: startAngle + range * (100/500), to: startAngle + range * (200/500), color: '#F59E0B' },
    { from: startAngle + range * (200/500), to: startAngle + range * (300/500), color: '#EF4444' },
    { from: startAngle + range * (300/500), to: startAngle + range * (400/500), color: '#8B5CF6' },
    { from: startAngle + range * (400/500), to: endAngle,   color: '#7C2D12' },
  ];

  return (
    <div className="gauge-wrapper">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
        {/* Background arc */}
        <path
          d={arcPath(startAngle, endAngle, r)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={14}
          strokeLinecap="round"
        />

        {/* Zone arcs */}
        {zones.map((z, i) => (
          <path
            key={i}
            d={arcPath(z.from, z.to, r)}
            fill="none"
            stroke={z.color}
            strokeWidth={10}
            strokeLinecap="butt"
            opacity={0.35}
          />
        ))}

        {/* Active fill arc */}
        <path
          d={arcPath(startAngle, startAngle + pct * range, r)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />

        {/* Needle */}
        <polygon
          points={`${needle.x},${needle.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={color}
          opacity={0.95}
        />
        <circle cx={cx} cy={cy} r={6} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
        <circle cx={cx} cy={cy} r={3} fill="var(--navy-900)" />

        {/* Value text */}
        <text
          x={cx} y={cy - 20}
          textAnchor="middle"
          fill={color}
          fontSize={size * 0.2}
          fontWeight="900"
          fontFamily="Inter"
        >
          {aqi > 0 ? Math.round(aqi) : '—'}
        </text>

        <text
          x={cx} y={cy - 4}
          textAnchor="middle"
          fill="rgba(255,255,255,0.5)"
          fontSize={size * 0.065}
          fontFamily="Inter"
        >
          AQI
        </text>
      </svg>

      {/* Category label */}
      <div style={{
        fontSize: 13,
        fontWeight: 700,
        color,
        letterSpacing: '0.5px',
        padding: '4px 14px',
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: 20,
      }}>
        {cat}
      </div>
    </div>
  );
}
