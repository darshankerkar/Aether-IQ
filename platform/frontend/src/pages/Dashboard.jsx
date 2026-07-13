import { useState, useEffect } from 'react';
import { api, aqiColor, aqiCategory, formatAQI } from '../services/api';
import { Bar } from 'react-chartjs-2';
import { Activity, RadioTower, ThermometerSun, AlertTriangle, AlertOctagon, Skull, TrendingUp, PieChart, BellRing, CheckCircle, MapPin } from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function KPICard({ label, value, sub, icon, accent = 'var(--blue-500)' }) {
  return (
    <div className="kpi-card" style={{ '--accent': accent }}>
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: accent }}>{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}

function AlertRow({ alert }) {
  const color = aqiColor(alert.aqi_value);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        marginTop: 5, flexShrink: 0,
        boxShadow: `0 0 6px ${color}`,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {alert.station_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {alert.message_en}
        </div>
      </div>
      <div style={{
        fontSize: 13, fontWeight: 800, color,
        fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
      }}>
        {Math.round(alert.aqi_value)}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [kpis,    setKpis]    = useState(null);
  const [live,    setLive]    = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [trends,  setTrends]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.kpis(),
      api.live(),
      api.alerts(),
      api.trends(24),
    ]).then(([k, l, a, t]) => {
      setKpis(k.data);
      setLive(l.data.stations || []);
      setAlerts(a.data || []);
      setTrends(t.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // AQI distribution
  const distribution = {
    Good: live.filter(s => (s.aqi||0) <= 50).length,
    Satisfactory: live.filter(s => (s.aqi||0) > 50 && (s.aqi||0) <= 100).length,
    Moderate: live.filter(s => (s.aqi||0) > 100 && (s.aqi||0) <= 200).length,
    Poor: live.filter(s => (s.aqi||0) > 200 && (s.aqi||0) <= 300).length,
    'Very Poor': live.filter(s => (s.aqi||0) > 300 && (s.aqi||0) <= 400).length,
    Severe: live.filter(s => (s.aqi||0) > 400).length,
  };

  const barData = {
    labels: Object.keys(distribution),
    datasets: [{
      label: 'Stations',
      data: Object.values(distribution),
      backgroundColor: ['#10B98155','#84CC1655','#F59E0B55','#EF444455','#8B5CF655','#7C2D1255'],
      borderColor:     ['#10B981','#84CC16','#F59E0B','#EF4444','#8B5CF6','#7C2D12'],
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(10,22,40,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: 'rgba(148,163,184,0.7)', font: { family: 'Inter', size: 11 } }, grid: { display: false } },
      y: { ticks: { color: 'rgba(148,163,184,0.7)', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };

  // Trend chart data
  const trendChartData = {
    labels: trends.slice(-24).map(t => {
      const d = new Date(t.timestamp);
      return `${d.getHours()}:00`;
    }),
    datasets: [{
      label: 'National Avg AQI',
      data: trends.slice(-24).map(t => t.aqi),
      borderColor: 'rgba(37, 99, 235, 0.9)',
      backgroundColor: (ctx) => {
        const chart = ctx.chart;
        const { ctx: c, chartArea } = chart;
        if (!chartArea) return 'transparent';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0, 'rgba(37,99,235,0.25)');
        g.addColorStop(1, 'rgba(37,99,235,0.01)');
        return g;
      },
      fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2,
    }],
  };

  const trendOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(10,22,40,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
    scales: {
      x: { ticks: { color: 'rgba(148,163,184,0.6)', font: { family: 'Inter', size: 10 } }, grid: { display: false } },
      y: { ticks: { color: 'rgba(148,163,184,0.6)', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    },
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title"><Activity className="inline-icon" /> Dashboard</h1>
        </div>
        <div className="kpi-grid">
          {[1,2,3,4].map(i => <div key={i} className="kpi-card"><div className="skeleton" style={{height: 80}} /></div>)}
        </div>
      </div>
    );
  }

  const worst = kpis?.worst_station;

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="page-title"><Activity className="inline-icon" /> National AQI Intelligence Dashboard</h1>
            <p className="page-subtitle">
              Real-time air quality monitoring across India • {live.length} active stations
            </p>
          </div>
          <div className="live-indicator">
            <div className="live-dot" />
            Live · Updated now
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KPICard
          label="Total Stations"
          value={kpis?.total_stations || live.length}
          sub={`Across ${kpis?.total_cities || '—'} cities`}
          icon={<RadioTower size={24} />}
          accent="var(--blue-400)"
        />
        <KPICard
          label="National Avg AQI"
          value={formatAQI(kpis?.national_avg_aqi)}
          sub={aqiCategory(kpis?.national_avg_aqi)}
          icon={<ThermometerSun size={24} />}
          accent={aqiColor(kpis?.national_avg_aqi)}
        />
        <KPICard
          label="Severe Stations"
          value={kpis?.severe_stations || 0}
          sub="AQI > 300 — Emergency"
          icon={<AlertOctagon size={24} />}
          accent="var(--danger)"
        />
        <KPICard
          label="Poor Air Quality"
          value={kpis?.poor_stations || 0}
          sub="AQI 200–300 stations"
          icon={<AlertTriangle size={24} />}
          accent="var(--warning)"
        />
        {worst && (
          <KPICard
            label="Most Polluted"
            value={formatAQI(worst.aqi)}
            sub={worst.name}
            icon={<Skull size={24} />}
            accent="var(--aqi-very-poor)"
          />
        )}
      </div>

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title"><TrendingUp className="inline-icon" size={16} /> 24-Hour National AQI Trend</div>
          </div>
          <div className="card-body">
            <div style={{ height: 200 }}>
              <Bar data={trendChartData} options={trendOpts} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><PieChart className="inline-icon" size={16} /> AQI Distribution Across Stations</div>
          </div>
          <div className="card-body">
            <div style={{ height: 200 }}>
              <Bar data={barData} options={barOpts} />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: alerts + top stations */}
      <div className="grid-2">
        {/* Active Alerts */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><BellRing className="inline-icon" size={16} /> Active Health Alerts</div>
            <span className="info-chip">{alerts.length} active</span>
          </div>
          <div className="card-body scroll-panel" style={{ maxHeight: 340 }}>
            {alerts.length === 0 ? (
              <div className="empty-state">
                <div className="icon"><CheckCircle size={32} /></div>
                <h3>No Critical Alerts</h3>
                <p>All monitored areas within acceptable range</p>
              </div>
            ) : (
              alerts.slice(0, 10).map((a, i) => <AlertRow key={i} alert={a} />)
            )}
          </div>
        </div>

        {/* Top 10 Worst Stations */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><MapPin className="inline-icon" size={16} /> Most Polluted Stations</div>
            <span className="info-chip">Ranked by AQI</span>
          </div>
          <div className="card-body" style={{ padding: '8px 16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Station</th>
                  <th>City</th>
                  <th>AQI</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {live.slice(0, 8).map((s, i) => {
                  const color = aqiColor(s.aqi);
                  const cat   = aqiCategory(s.aqi);
                  return (
                    <tr key={s.station_id}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td className="primary" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                      </td>
                      <td>{s.city}</td>
                      <td style={{ color, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
                        {formatAQI(s.aqi)}
                      </td>
                      <td>
                        <span className={`aqi-badge ${cat.toLowerCase().replace(' ', '-')}`}>
                          {cat}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
