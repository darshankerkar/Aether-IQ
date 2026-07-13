import { useState, useEffect } from 'react';
import { api, aiApi, aqiColor, formatAQI } from '../services/api';
import AttributionChart from '../components/AttributionChart';
import { Search, PieChart, RadioTower, Cpu, TrendingDown, TrendingUp, Zap, CheckCircle, XCircle } from 'lucide-react';

export default function Attribution() {
  const [stations,    setStations]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [attribution, setAttribution] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => {
    api.live().then(r => {
      const stns = (r.data.stations || []).slice(0, 30);
      setStations(stns);
    });
  }, []);

  const handleSelect = async (s) => {
    setSelected(s);
    setLoading(true);
    setAttribution(null);
    setExplanation(null);
    try {
      const [attr, expl] = await Promise.all([
        aiApi.attribution(s.name),
        aiApi.explain(s.name, s.aqi || 150),
      ]);
      setAttribution(attr.data);
      setExplanation(expl.data);
    } catch {}
    setLoading(false);
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><Search className="inline-icon" /> Source Attribution Engine</h1>
        <p className="page-subtitle">
          AI attribution of pollution by source category with statistical confidence — Traffic · Industrial · Construction · Meteorological
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Station list */}
        <div className="card" style={{ width: 260, flexShrink: 0 }}>
          <div className="card-header">
            <div className="card-title">Select Station</div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 600 }}>
            {stations.map(s => {
              const c = aqiColor(s.aqi);
              const active = selected?.station_id === s.station_id;
              return (
                <div
                  key={s.station_id}
                  onClick={() => handleSelect(s)}
                  style={{
                    padding: '11px 16px',
                    cursor: 'pointer',
                    display: 'flex', gap: 10, alignItems: 'center',
                    background: active ? 'rgba(37,99,235,0.10)' : 'transparent',
                    borderLeft: `3px solid ${active ? c : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.city}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c, fontFamily: 'JetBrains Mono' }}>
                    {formatAQI(s.aqi)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Attribution detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!selected ? (
            <div className="card">
              <div className="empty-state">
                <div className="icon"><Search size={32} /></div>
                <h3>Select a station to run attribution analysis</h3>
                <p>The AI engine will attribute pollution to traffic, industrial, construction, and meteorological factors</p>
              </div>
            </div>
          ) : loading ? (
            <div className="card">
              <div className="card-body">
                <div className="skeleton" style={{ height: 300, borderRadius: 8 }} />
              </div>
            </div>
          ) : (
            <div className="grid-2">
              {/* Chart */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><PieChart size={16} className="inline-icon" /> Attribution Breakdown</div>
                  {attribution && <span className="info-chip">Confidence: {(attribution.confidence*100).toFixed(0)}%</span>}
                </div>
                <div className="card-body">
                  <AttributionChart attribution={attribution} size={220} />
                </div>
              </div>

              {/* Signals */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><RadioTower size={16} className="inline-icon" /> Environmental Signals</div>
                </div>
                <div className="card-body">
                  {attribution?.signals && Object.entries(attribution.signals).map(([key, val]) => (
                    <div key={key} className="signal-row">
                      <div className="signal-key">{key.replace(/_/g,' ').replace('ugm3','µg/m³').replace('kmh','km/h').replace('mm','mm')}</div>
                      <div className="signal-value">
                        {typeof val === 'boolean' ? (val ? <><CheckCircle size={12} className="inline-icon" color="#10B981" /> Yes</> : <><XCircle size={12} className="inline-icon" color="#EF4444" /> No</>) : val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI Explanation */}
              {explanation && (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <div className="card-header">
                    <div className="card-title"><Cpu size={16} className="inline-icon" /> AI Explanation</div>
                    <span className="info-chip">NLG Engine</span>
                  </div>
                  <div className="card-body">
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
                      {explanation.summary}
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                      {(explanation.key_reasons || []).map((r, i) => (
                        <div key={i} style={{
                          padding: '10px 14px',
                          background: r.impact === 'negative' ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
                          border: `1px solid ${r.impact === 'negative' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                          borderRadius: 10,
                          minWidth: 160, maxWidth: 220,
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: r.impact === 'negative' ? '#EF4444' : '#10B981', marginBottom: 4 }}>
                            {r.impact === 'negative' ? <TrendingDown size={14} className="inline-icon" /> : <TrendingUp size={14} className="inline-icon" />} {r.factor}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{r.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.explanation}</div>
                        </div>
                      ))}
                    </div>

                    {/* Recommended Action */}
                    <div style={{
                      background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 10, padding: '14px 16px',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>
                        <Zap size={14} className="inline-icon" /> Recommended Action
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {explanation.recommended_action}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
