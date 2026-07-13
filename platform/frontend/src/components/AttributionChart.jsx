import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const SOURCE_COLORS = {
  traffic:      '#EF4444',
  industrial:   '#8B5CF6',
  construction: '#F59E0B',
  natural:      '#10B981',
  others:       '#64748B',
};

const SOURCE_LABELS = {
  traffic:      '🚗 Traffic',
  industrial:   '🏭 Industrial',
  construction: '🏗️ Construction',
  natural:      '🌬️ Natural/Met.',
  others:       '⚙️ Others',
};

export default function AttributionChart({ attribution, size = 200 }) {
  if (!attribution) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        <div className="icon">🔍</div>
        <p>Attribution data unavailable</p>
      </div>
    );
  }

  const keys   = ['traffic', 'industrial', 'construction', 'natural', 'others'];
  const values = keys.map(k => parseFloat(attribution[k] || 0));
  const colors = keys.map(k => SOURCE_COLORS[k]);

  const data = {
    labels:   keys.map(k => SOURCE_LABELS[k]),
    datasets: [{
      data:            values,
      backgroundColor: colors.map(c => c + '99'),
      borderColor:     colors,
      borderWidth:     2,
      hoverOffset:     6,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.raw.toFixed(1)}%`,
        },
        backgroundColor: 'rgba(10,22,40,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleFont: { family: 'Inter', weight: '600' },
        bodyFont:  { family: 'Inter' },
      },
    },
  };

  const dominant = attribution.dominant || 'Unknown';
  const domColor = SOURCE_COLORS[dominant.toLowerCase().split('/')[0]] || '#64748B';

  return (
    <div>
      <div style={{ width: size, margin: '0 auto', position: 'relative' }}>
        <Doughnut data={data} options={options} />
        {/* Center label */}
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.5 }}>DOMINANT</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: domColor, marginTop: 2 }}>{dominant.split('/')[0]}</div>
          <div style={{ fontSize: 20, marginTop: 2 }}>
            {dominant.toLowerCase().includes('traffic') ? '🚗' :
             dominant.toLowerCase().includes('industrial') ? '🏭' :
             dominant.toLowerCase().includes('construction') ? '🏗️' : '🌬️'}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {keys.map(k => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: SOURCE_COLORS[k], flexShrink: 0,
            }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
              {SOURCE_LABELS[k]}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: SOURCE_COLORS[k], fontFamily: 'JetBrains Mono, monospace' }}>
              {(attribution[k] || 0).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Confidence */}
      {attribution.confidence && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Attribution Confidence</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <div style={{
              flex: 1, height: 4, background: 'var(--navy-600)', borderRadius: 2,
            }}>
              <div style={{
                width: `${attribution.confidence * 100}%`,
                height: '100%',
                background: 'var(--blue-500)',
                borderRadius: 2,
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue-300)' }}>
              {(attribution.confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
