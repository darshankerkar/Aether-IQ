import { useState, useEffect } from 'react';
import { api, aqiColor, aqiCategory, formatAQI } from '../services/api';
import { Users, CheckCircle, AlertTriangle, AlertOctagon, Skull, ClipboardList, School, Hospital, ShieldAlert } from 'lucide-react';

const RISK_STYLES = {
  low:      { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.3)', color: '#10B981', icon: <CheckCircle size={28} /> },
  moderate: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: '#F59E0B', icon: <AlertTriangle size={28} /> },
  high:     { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  color: '#EF4444', icon: <AlertOctagon size={28} /> },
  critical: { bg: 'rgba(124,45,18,0.2)',  border: 'rgba(239,68,68,0.4)',  color: '#F87171', icon: <Skull size={28} /> },
};

export default function Citizen() {
  const [alerts, setAlerts] = useState([]);
  const [live,   setLive]   = useState([]);
  const [tab,    setTab]    = useState('advisories'); // advisories | schools | hospitals

  useEffect(() => {
    Promise.all([api.alerts(), api.live()]).then(([a, l]) => {
      setAlerts(a.data || []);
      setLive(l.data.stations || []);
    });
  }, []);

  const critical = alerts.filter(a => a.risk_level === 'critical');
  const high     = alerts.filter(a => a.risk_level === 'high');

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><Users className="inline-icon" /> Citizen Health Portal</h1>
        <p className="page-subtitle">
          Ward-level health advisories, multilingual alerts, and public safety guidance based on real-time AQI
        </p>
      </div>

      {/* Emergency Banner */}
      {critical.length > 0 && (
        <div style={{
          background: 'rgba(124,45,18,0.2)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{ color: '#F87171' }}><Skull size={28} /></div>
          <div>
            <div style={{ fontWeight: 700, color: '#F87171', fontSize: 14 }}>
              EMERGENCY HEALTH ALERT — {critical.length} location{critical.length > 1 ? 's' : ''} in Severe category
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
              Outdoor activity is prohibited in affected areas. Stay indoors and use air purifiers.
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[
          ['advisories', <><ClipboardList size={16} className="inline-icon" /> Health Advisories</>],
          ['schools',    <><School size={16} className="inline-icon" /> Schools & Colleges</>],
          ['hospitals',  <><Hospital size={16} className="inline-icon" /> Hospitals</>],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'advisories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {alerts.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="icon"><CheckCircle size={32} /></div>
                <h3>No Active Alerts</h3>
                <p>Air quality is within acceptable limits across monitored areas</p>
              </div>
            </div>
          ) : (
            alerts.map((alert, i) => {
              const style = RISK_STYLES[alert.risk_level] || RISK_STYLES.moderate;
              return (
                <div key={i} style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <span style={{ fontSize: 28, flexShrink: 0 }}>{style.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: style.color }}>
                        {alert.station_name}
                      </span>
                      <span className={`aqi-badge ${aqiCategory(alert.aqi_value).toLowerCase().replace(' ','-')}`}>
                        AQI {formatAQI(alert.aqi_value)}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                        padding: '2px 8px', borderRadius: 10,
                        background: style.bg, border: `1px solid ${style.border}`,
                        color: style.color, textTransform: 'uppercase',
                      }}>
                        {alert.risk_level}
                      </span>
                    </div>

                    {/* English message */}
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.5 }}>
                      {alert.message_en}
                    </p>

                    {/* Hindi message */}
                    {alert.message_hi && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.5, fontStyle: 'italic' }}>
                        🇮🇳 {alert.message_hi}
                      </p>
                    )}

                    {/* Advisory */}
                    {alert.advisory && (
                      <div style={{
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        borderLeft: `3px solid ${style.color}`,
                      }}>
                        {alert.advisory}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {(tab === 'schools' || tab === 'hospitals') && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">
                {tab === 'schools' ? <><School size={16} className="inline-icon" /> School Activity Guidelines</> : <><Hospital size={16} className="inline-icon" /> Hospital Air Quality Protocols</>}
              </div>
            </div>
            <div className="card-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>AQI Range</th>
                    <th>Category</th>
                    <th>{tab === 'schools' ? 'Outdoor Activity' : 'Protocol'}</th>
                    <th>Recommended Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [0, 100,  'Good/Satisfactory', tab === 'schools' ? 'All permitted' : 'Normal ops', 'No special measures'],
                    [101, 200, 'Moderate', tab === 'schools' ? 'Limited' : 'Monitor closely', 'Reduce outdoor PT. Use indoor air purifiers'],
                    [201, 300, 'Poor', tab === 'schools' ? 'Suspended' : 'Heightened alert', 'Cancel outdoor events. Notify parents. Air filters mandatory'],
                    [301, 400, 'Very Poor', tab === 'schools' ? 'School closure advised' : 'Emergency protocol', 'Physical closure recommended. Remote only'],
                    [401, 500, 'Severe', tab === 'schools' ? 'CLOSE SCHOOL' : 'EMERGENCY MODE', <><ShieldAlert size={14} className="inline-icon" /> Mandatory closure. Report to CPCB</>],
                  ].map(([lo, hi, cat, activity, action]) => {
                    const color = aqiColor((lo + hi) / 2);
                    return (
                      <tr key={lo}>
                        <td style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{lo}–{hi}</td>
                        <td><span className={`aqi-badge ${cat.toLowerCase().split('/')[0].replace(' ','-')}`}>{cat}</span></td>
                        <td style={{ color }}>{activity}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Affected areas */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                {tab === 'schools' ? <><ShieldAlert size={16} className="inline-icon" /> Stations Requiring School Closure</> : <><AlertTriangle size={16} className="inline-icon" /> High-Risk Hospital Zones</>}
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {live.filter(s => (s.aqi || 0) > (tab === 'schools' ? 300 : 200)).map(s => {
                const c = aqiColor(s.aqi);
                return (
                  <div key={s.station_id} style={{
                    padding: '10px 14px',
                    background: `${c}12`,
                    border: `1px solid ${c}30`,
                    borderRadius: 10,
                    minWidth: 160,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.city}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: c, fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                      {formatAQI(s.aqi)}
                    </div>
                  </div>
                );
              })}
              {live.filter(s => (s.aqi || 0) > (tab === 'schools' ? 300 : 200)).length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> No {tab === 'schools' ? 'schools' : 'hospitals'} in high-risk zones at this time
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
