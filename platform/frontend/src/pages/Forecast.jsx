import { useState, useEffect } from 'react';
import { api, aiApi, aqiColor, aqiCategory, formatAQI } from '../services/api';
import ForecastChart from '../components/ForecastChart';
import AQIGauge from '../components/AQIGauge';
import { LineChart, RadioTower, Sparkles, TrendingDown, Cpu } from 'lucide-react';

export default function Forecast() {
  const [stations, setStations]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [readings, setReadings]   = useState([]);
  const [forecast, setForecast]   = useState(null);
  const [loading,  setLoading]    = useState(false);
  const [search,   setSearch]     = useState('');

  useEffect(() => {
    api.live().then(r => {
      const stns = r.data.stations || [];
      setStations(stns);
      if (stns.length > 0) selectStation(stns[0]);
    });
  }, []);

  const selectStation = async (s) => {
    setSelected(s);
    setLoading(true);
    setForecast(null);
    setReadings([]);
    try {
      const [rd, fc] = await Promise.all([
        api.readings(s.station_id, 72),
        aiApi.forecast(s.name),
      ]);
      setReadings(rd.data || []);
      setForecast(fc.data);
    } catch {}
    setLoading(false);
  };

  const filtered = stations.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.city||'').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><LineChart className="inline-icon" /> AQI Forecast Engine</h1>
        <p className="page-subtitle">
          AI-powered 6h / 24h / 72h AQI predictions using RandomForest + meteorological fusion
        </p>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Station selector */}
        <div className="card" style={{ width: 280, flexShrink: 0 }}>
          <div className="card-header">
            <div className="card-title"><RadioTower size={16} className="inline-icon" /> Stations</div>
          </div>
          <div className="card-body" style={{ padding: '12px 14px' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search stations…"
              style={{
                width: '100%',
                background: 'var(--navy-700)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                marginBottom: 10,
              }}
            />
            <div style={{ overflowY: 'auto', maxHeight: 500 }}>
              {filtered.map(s => {
                const color = aqiColor(s.aqi);
                const active = selected?.station_id === s.station_id;
                return (
                  <div
                    key={s.station_id}
                    onClick={() => selectStation(s)}
                    style={{
                      padding: '10px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: active ? 'rgba(37,99,235,0.12)' : 'transparent',
                      border: `1px solid ${active ? 'var(--blue-500)' : 'transparent'}`,
                      marginBottom: 4,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: color, flexShrink: 0,
                      boxShadow: active ? `0 0 8px ${color}` : 'none',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {s.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.city}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, color, fontFamily: 'JetBrains Mono' }}>
                      {formatAQI(s.aqi)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main forecast view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!selected ? (
            <div className="card">
              <div className="empty-state">
                <div className="icon"><LineChart size={32} /></div>
                <h3>Select a Station</h3>
              </div>
            </div>
          ) : (
            <>
              {/* Current + forecast pills */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><Sparkles size={16} className="inline-icon" /> AI Forecast — {selected.name}</div>
                  {forecast && (
                    <span className="info-chip">
                      {forecast.model}
                    </span>
                  )}
                </div>
                <div className="card-body">
                  {loading ? (
                    <div style={{ display: 'flex', gap: 16 }}>
                      {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 120, borderRadius: 12 }} />)}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                      {/* Current */}
                      <div style={{
                        flex: 1, background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--border)', borderRadius: 12,
                        padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8 }}>CURRENT</div>
                        <AQIGauge value={forecast?.current_aqi || selected.aqi} size={140} />
                      </div>

                      {/* Forecast horizons */}
                      {(forecast?.forecasts || []).map(f => {
                        const c = aqiColor(f.predicted_aqi);
                        return (
                          <div key={f.horizon} style={{
                            flex: 1, background: `${c}0a`,
                            border: `1px solid ${c}30`,
                            borderRadius: 12, padding: 20,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.8 }}>
                              +{f.hours_ahead} HOURS
                            </div>
                            <div style={{
                              fontSize: 52, fontWeight: 900, color: c,
                              fontFamily: 'JetBrains Mono', lineHeight: 1,
                              filter: `drop-shadow(0 0 12px ${c}80)`,
                            }}>
                              {Math.round(f.predicted_aqi)}
                            </div>
                            <span className={`aqi-badge ${f.category.toLowerCase().replace(' ','-')}`}>
                              {f.category}
                            </span>
                            <div style={{ fontSize: 20 }}>{f.trend}</div>
                            <div style={{
                              fontSize: 11, color: 'var(--text-muted)',
                              background: 'rgba(255,255,255,0.05)',
                              padding: '3px 8px', borderRadius: 8,
                            }}>
                              {(f.confidence * 100).toFixed(0)}% confidence
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Historical + forecast chart */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><TrendingDown size={16} className="inline-icon" /> 72-Hour Historical + Forecast</div>
                  <span className="info-chip">{readings.length} historical readings</span>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="skeleton" style={{ height: 240, borderRadius: 8 }} />
                  ) : (
                    <ForecastChart
                      readings={readings}
                      forecasts={forecast?.forecasts || []}
                    />
                  )}
                </div>
              </div>

              {/* Forecast explanation */}
              {forecast && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><Cpu size={16} className="inline-icon" /> Model Diagnostics</div>
                  </div>
                  <div className="card-body">
                    <div className="grid-3" style={{ gap: 12 }}>
                      <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>FEATURES USED</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-300)' }}>
                          {forecast.features_used || 18}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AQI + Weather vars</div>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MODEL TYPE</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--blue-300)', marginTop: 4 }}>
                          RandomForest
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Multi-output regressor</div>
                      </div>
                      <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>TRAINING DATA</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue-300)' }}>87K+</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Station-hour records</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
