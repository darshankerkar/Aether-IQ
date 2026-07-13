import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ShieldAlert, AlertTriangle, AlertOctagon, TrendingDown, ClipboardList, CheckCircle, Zap, Clock, BarChart3 } from 'lucide-react';

const PRIORITY_COLORS = { high: '#EF4444', medium: '#F59E0B', low: '#64748B' };
const PRIORITY_BG     = { high: 'rgba(239,68,68,0.08)', medium: 'rgba(245,158,11,0.08)', low: 'rgba(100,116,139,0.08)' };

export default function Enforcement() {
  const [recs,    setRecs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    api.recommendations().then(r => {
      setRecs(r.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = recs.filter(r => {
    const matchFilter = filter === 'all' || r.priority === filter;
    const matchSearch = !search ||
      r.action?.toLowerCase().includes(search.toLowerCase()) ||
      r.station_name?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const highCount   = recs.filter(r => r.priority === 'high').length;
  const medCount    = recs.filter(r => r.priority === 'medium').length;
  const totalDelta  = recs.filter(r => r.priority === 'high').slice(0,5)
    .reduce((s, r) => s + (r.expected_aqi_delta || 0), 0);

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><ShieldAlert className="inline-icon" /> Enforcement Intelligence</h1>
        <p className="page-subtitle">
          AI-generated prioritised action recommendations for municipal and pollution control authorities
        </p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Critical Actions', value: highCount,   color: '#EF4444', icon: <AlertOctagon size={24} /> },
          { label: 'Medium Priority',  value: medCount,    color: '#F59E0B', icon: <AlertTriangle size={24} /> },
          { label: 'Max AQI Reduction', value: `${Math.abs(totalDelta).toFixed(0)} pts`, color: '#10B981', icon: <TrendingDown size={24} /> },
          { label: 'Total Actions',    value: recs.length, color: 'var(--blue-400)', icon: <ClipboardList size={24} /> },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ flex: 1 }}>
            <div className="kpi-icon">{k.icon}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color, fontSize: 28 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search actions or stations…"
          style={{
            flex: 1, maxWidth: 320,
            background: 'var(--navy-800)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 14px',
            color: 'var(--text-primary)', fontSize: 13, outline: 'none',
          }}
        />
        {['all', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            style={filter === f && f !== 'all' ? { background: PRIORITY_BG[f], color: PRIORITY_COLORS[f], border: `1px solid ${PRIORITY_COLORS[f]}40` } : {}}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><ClipboardList size={16} className="inline-icon" /> Action Recommendations — {filtered.length} items</div>
          <span className="info-chip">Ranked by Priority × AQI Impact</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="card-body">
              <div className="skeleton" style={{ height: 300, borderRadius: 8 }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="icon"><CheckCircle size={32} /></div>
              <h3>No recommendations match filters</h3>
            </div>
          ) : (
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Priority</th>
                  <th>Station / Location</th>
                  <th>Recommended Action</th>
                  <th>Expected AQI Δ</th>
                  <th>Confidence</th>
                  <th>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 60).map((r, i) => (
                  <tr key={r.id || i}>
                    <td style={{ color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                    <td>
                      <span className={`priority-badge ${r.priority}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="primary" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.station_name}
                    </td>
                    <td style={{ color: 'var(--text-primary)', maxWidth: 280 }}>
                      {r.action}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 14, fontWeight: 800,
                        color: '#10B981',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}>
                        {r.expected_aqi_delta > 0 ? '+' : ''}{r.expected_aqi_delta} pts
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                          width: 50, height: 4, background: 'var(--navy-600)', borderRadius: 2,
                        }}>
                          <div style={{
                            width: `${(r.confidence || 0.7) * 100}%`,
                            height: '100%',
                            background: PRIORITY_COLORS[r.priority] || 'var(--blue-500)',
                            borderRadius: 2,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {((r.confidence || 0.7) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                        color: r.priority === 'high' ? '#EF4444' : r.priority === 'medium' ? '#F59E0B' : 'var(--text-muted)',
                      }}>
                        {r.priority === 'high' ? <><Zap size={12} /> Immediate</> : r.priority === 'medium' ? <><Clock size={12} /> Within 24h</> : <><ClipboardList size={12} /> Advisory</>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Impact Summary */}
      {!loading && filtered.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <div className="card-title"><BarChart3 size={16} className="inline-icon" /> Estimated Collective Impact</div>
          </div>
          <div className="card-body">
            <div className="grid-3">
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>IF ALL HIGH-PRIORITY ACTIONS TAKEN</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#10B981' }}>
                  {Math.abs(totalDelta).toFixed(0)}
                  <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>AQI pts</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>potential reduction</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>HOSPITAL ADMISSIONS</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#8B5CF6' }}>
                  ~{(Math.abs(totalDelta) * 0.07).toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>estimated reduction</div>
              </div>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>ENFORCEMENT ZONES</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#F59E0B' }}>{highCount}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>critical sites requiring immediate action</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
