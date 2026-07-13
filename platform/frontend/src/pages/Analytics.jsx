import { useState, useEffect } from 'react';
import { api, aqiColor, formatAQI } from '../services/api';
import { BarChart3, Building2, ThermometerSun, Skull, CheckCircle, AlertOctagon, PieChart } from 'lucide-react';
import { Bar, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement, Filler,
  Title, Tooltip, Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement, Filler,
  Title, Tooltip, Legend,
);

export default function Analytics() {
  const [cities,  setCities]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.citySummary().then(r => {
      setCities(r.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const top10 = cities.slice(0, 10);

  // Bar chart — city avg AQI
  const barData = {
    labels: top10.map(c => c.city),
    datasets: [{
      label: 'Average AQI (24h)',
      data:  top10.map(c => c.avg_aqi),
      backgroundColor: top10.map(c => aqiColor(c.avg_aqi) + '99'),
      borderColor:     top10.map(c => aqiColor(c.avg_aqi)),
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const barOpts = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(10,22,40,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
    },
    scales: {
      x: { ticks: { color: 'rgba(148,163,184,0.6)', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
      y: { ticks: { color: 'rgba(148,163,184,0.8)', font: { family: 'Inter', size: 11 } }, grid: { display: false } },
    },
  };

  // AQI distribution across all cities
  const distribution = {
    Good:       cities.filter(c => c.avg_aqi <= 50).length,
    Satisfactory: cities.filter(c => c.avg_aqi > 50 && c.avg_aqi <= 100).length,
    Moderate:   cities.filter(c => c.avg_aqi > 100 && c.avg_aqi <= 200).length,
    Poor:       cities.filter(c => c.avg_aqi > 200 && c.avg_aqi <= 300).length,
    'Very Poor':cities.filter(c => c.avg_aqi > 300 && c.avg_aqi <= 400).length,
    Severe:     cities.filter(c => c.avg_aqi > 400).length,
  };

  const distData = {
    labels: Object.keys(distribution),
    datasets: [{
      label: 'Cities',
      data:  Object.values(distribution),
      backgroundColor: ['#10B98150','#84CC1650','#F59E0B50','#EF444450','#8B5CF650','#7C2D1250'],
      borderColor:     ['#10B981','#84CC16','#F59E0B','#EF4444','#8B5CF6','#7C2D12'],
      borderWidth: 2, borderRadius: 6,
    }],
  };

  const distOpts = {
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

  const avgAQI = cities.length > 0 ? cities.reduce((s, c) => s + c.avg_aqi, 0) / cities.length : 0;
  const worst  = cities[0];
  const best   = cities[cities.length - 1];

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><BarChart3 className="inline-icon" /> Multi-City Analytics</h1>
        <p className="page-subtitle">
          Comparative air quality intelligence across Indian cities — 24-hour aggregated data
        </p>
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Cities Monitored', value: cities.length, color: 'var(--blue-400)', icon: <Building2 size={24} /> },
          { label: 'National Avg AQI', value: formatAQI(avgAQI), color: aqiColor(avgAQI), icon: <ThermometerSun size={24} /> },
          { label: 'Worst City AQI',  value: worst ? formatAQI(worst.avg_aqi) : '—', color: '#EF4444', icon: <Skull size={24} />, sub: worst?.city },
          { label: 'Best City AQI',   value: best  ? formatAQI(best.avg_aqi) : '—',  color: '#10B981', icon: <CheckCircle size={24} />, sub: best?.city },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ flex: 1 }}>
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 28 }}>{k.value}</div>
            {k.sub && <div className="kpi-sub">{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        {/* Horizontal bar: top 10 worst cities */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><AlertOctagon size={16} className="inline-icon" color="#EF4444" /> Most Polluted Cities (Avg 24h AQI)</div>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton" style={{ height: 280, borderRadius: 8 }} />
            ) : (
              <div style={{ height: 280 }}>
                <Bar data={barData} options={barOpts} />
              </div>
            )}
          </div>
        </div>

        {/* Distribution */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><PieChart size={16} className="inline-icon" /> City AQI Distribution</div>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton" style={{ height: 280, borderRadius: 8 }} />
            ) : (
              <div style={{ height: 280 }}>
                <Bar data={distData} options={distOpts} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full city table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Building2 size={16} className="inline-icon" /> All Cities — Comprehensive Comparison</div>
          <span className="info-chip">{cities.length} cities</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>City</th>
                <th>State</th>
                <th>Avg AQI</th>
                <th>Max AQI</th>
                <th>Min AQI</th>
                <th>Stations</th>
                <th>Category</th>
                <th>AQI Bar</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9}><div className="skeleton" style={{ height: 200, margin: 10, borderRadius: 8 }} /></td></tr>
              ) : (
                cities.map((c, i) => {
                  const color = aqiColor(c.avg_aqi);
                  return (
                    <tr key={c.city}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                      <td className="primary">{c.city}</td>
                      <td>{c.state || '—'}</td>
                      <td style={{ color, fontWeight: 800, fontFamily: 'JetBrains Mono' }}>{formatAQI(c.avg_aqi)}</td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono' }}>{formatAQI(c.max_aqi)}</td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono' }}>{formatAQI(c.min_aqi)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{c.station_count}</td>
                      <td>
                        <span className={`aqi-badge ${c.avg_aqi <= 50 ? 'good' : c.avg_aqi <= 100 ? 'satisfactory' : c.avg_aqi <= 200 ? 'moderate' : c.avg_aqi <= 300 ? 'poor' : 'very-poor'}`}>
                          {c.avg_aqi <= 50 ? 'Good' : c.avg_aqi <= 100 ? 'Satisfactory' : c.avg_aqi <= 200 ? 'Moderate' : c.avg_aqi <= 300 ? 'Poor' : 'Very Poor'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 80, height: 5, background: 'var(--navy-600)', borderRadius: 3 }}>
                            <div style={{
                              width: `${Math.min(100, (c.avg_aqi / 500) * 100)}%`,
                              height: '100%', background: color, borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/500</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
