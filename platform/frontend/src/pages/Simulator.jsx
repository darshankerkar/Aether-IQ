import { useState, useEffect } from 'react';
import { api, aiApi, aqiColor, aqiCategory } from '../services/api';
import { FlaskConical, MapPin, SlidersHorizontal, Car, HardHat, Factory, TreePine, Wind, Play, Loader2, BarChart3, CheckCircle, HeartPulse } from 'lucide-react';

export default function Simulator() {
  const [stations,  setStations]  = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [params,    setParams]    = useState({
    reduce_traffic_pct:    0,
    restrict_construction: false,
    reduce_industrial_pct: 0,
    increase_green_cover:  false,
    wind_speed_boost:      0,
  });
  const [result,   setResult]   = useState(null);
  const [running,  setRunning]  = useState(false);

  useEffect(() => {
    api.live().then(r => {
      const stns = r.data.stations || [];
      setStations(stns);
      if (stns.length > 0) setSelected(stns[0]);
    });
  }, []);

  const runSimulation = async () => {
    if (!selected) return;
    setRunning(true);
    setResult(null);
    try {
      const payload = {
        station_name:          selected.name,
        current_aqi:           selected.aqi || 150,
        current_pm25:          selected.pm25,
        current_pm10:          selected.pm10,
        ...params,
      };
      const r = await aiApi.simulate(payload);
      setResult(r.data);
    } catch (err) {
      console.error(err);
    }
    setRunning(false);
  };

  const reset = () => {
    setParams({
      reduce_traffic_pct: 0, restrict_construction: false,
      reduce_industrial_pct: 0, increase_green_cover: false, wind_speed_boost: 0,
    });
    setResult(null);
  };

  const currentColor   = aqiColor(selected?.aqi);
  const predictedColor = aqiColor(result?.predicted_aqi);

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <h1 className="page-title"><FlaskConical className="inline-icon" /> What-if Simulator</h1>
        <p className="page-subtitle">
          Model the impact of interventions before implementation — evidence-based AQI reduction estimation
        </p>
      </div>

      <div className="grid-2">
        {/* Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Station picker */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><MapPin size={16} className="inline-icon" /> Target Station</div>
            </div>
            <div className="card-body">
              <select
                value={selected?.station_id || ''}
                onChange={e => setSelected(stations.find(s => s.station_id == e.target.value))}
                style={{
                  width: '100%',
                  background: 'var(--navy-700)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '10px 12px',
                  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
                }}
              >
                {stations.map(s => (
                  <option key={s.station_id} value={s.station_id}>
                    {s.name} — AQI {Math.round(s.aqi || 0)} ({aqiCategory(s.aqi)})
                  </option>
                ))}
              </select>
              {selected && (
                <div style={{
                  marginTop: 12, padding: '10px 14px',
                  background: `${currentColor}12`, border: `1px solid ${currentColor}30`,
                  borderRadius: 10, display: 'flex', gap: 12, alignItems: 'center',
                }}>
                  <div style={{ fontSize: 32, fontWeight: 900, color: currentColor, fontFamily: 'JetBrains Mono' }}>
                    {Math.round(selected.aqi || 0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>Current AQI</div>
                    <div style={{ fontSize: 12, color: currentColor }}>{aqiCategory(selected.aqi)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selected.city}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Intervention controls */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><SlidersHorizontal size={16} className="inline-icon" /> Intervention Parameters</div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Traffic slider */}
              <div className="slider-group">
                <div className="slider-label">
                  <span><Car size={16} className="inline-icon" /> Reduce Vehicular Traffic</span>
                  <span style={{ color: 'var(--blue-300)', fontFamily: 'JetBrains Mono' }}>
                    {params.reduce_traffic_pct}%
                  </span>
                </div>
                <div className="slider-desc">Restrict heavy diesel trucks, odd-even scheme, congestion pricing</div>
                <input
                  type="range" min="0" max="80" step="5"
                  value={params.reduce_traffic_pct}
                  onChange={e => setParams(p => ({ ...p, reduce_traffic_pct: +e.target.value }))}
                />
              </div>

              {/* Construction toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="checkbox"
                  id="construction"
                  checked={params.restrict_construction}
                  onChange={e => setParams(p => ({ ...p, restrict_construction: e.target.checked }))}
                />
                <label htmlFor="construction" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <HardHat size={16} className="inline-icon" /> Suspend all construction activity
                </label>
                <span style={{ fontSize: 11, color: '#F59E0B' }}>−22 AQI est.</span>
              </div>

              {/* Industrial slider */}
              <div className="slider-group">
                <div className="slider-label">
                  <span><Factory size={16} className="inline-icon" /> Reduce Industrial Emissions</span>
                  <span style={{ color: 'var(--blue-300)', fontFamily: 'JetBrains Mono' }}>
                    {params.reduce_industrial_pct}%
                  </span>
                </div>
                <div className="slider-desc">Emergency emission controls, wet bag filters, reduced furnace ops</div>
                <input
                  type="range" min="0" max="60" step="5"
                  value={params.reduce_industrial_pct}
                  onChange={e => setParams(p => ({ ...p, reduce_industrial_pct: +e.target.value }))}
                />
              </div>

              {/* Green cover toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="checkbox"
                  id="green"
                  checked={params.increase_green_cover}
                  onChange={e => setParams(p => ({ ...p, increase_green_cover: e.target.checked }))}
                />
                <label htmlFor="green" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  <TreePine size={16} className="inline-icon" /> Increase green cover & road sprinkling
                </label>
                <span style={{ fontSize: 11, color: '#10B981' }}>−7 AQI est.</span>
              </div>

              {/* Wind boost slider */}
              <div className="slider-group">
                <div className="slider-label">
                  <span><Wind size={16} className="inline-icon" /> Atmospheric Dispersion (wind +)</span>
                  <span style={{ color: 'var(--blue-300)', fontFamily: 'JetBrains Mono' }}>
                    +{params.wind_speed_boost} km/h
                  </span>
                </div>
                <div className="slider-desc">Simulate improved wind conditions / meteorological dispersion</div>
                <input
                  type="range" min="0" max="20" step="1"
                  value={params.wind_speed_boost}
                  onChange={e => setParams(p => ({ ...p, wind_speed_boost: +e.target.value }))}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={runSimulation}
                  disabled={running}
                >
                  {running ? <><Loader2 size={16} className="inline-icon" /> Computing…</> : <><Play size={16} className="inline-icon" /> Run Simulation</>}
                </button>
                <button className="btn btn-ghost" onClick={reset}>Reset</button>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!result ? (
            <div className="card" style={{ flex: 1 }}>
              <div className="empty-state">
                <div className="icon" style={{ fontSize: 64 }}><FlaskConical size={64} /></div>
                <h3>Configure interventions and run the simulation</h3>
                <p>The AI model will estimate AQI reduction, pollutant changes, and health impact using EPA/CPCB emission factor studies</p>
              </div>
            </div>
          ) : (
            <>
              {/* Before vs After */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><BarChart3 size={16} className="inline-icon" /> Simulation Results</div>
                  <span className="info-chip">Confidence: {(result.avg_confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    {/* Before */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>BEFORE</div>
                      <div style={{
                        fontSize: 64, fontWeight: 900, color: currentColor,
                        fontFamily: 'JetBrains Mono',
                        filter: `drop-shadow(0 0 16px ${currentColor}60)`,
                      }}>
                        {Math.round(result.current_aqi)}
                      </div>
                      <div style={{ fontSize: 12, color: currentColor }}>{result.current_category}</div>
                    </div>

                    {/* Arrow */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32 }}>→</div>
                      <div style={{
                        fontSize: 20, fontWeight: 900,
                        color: result.aqi_reduction < 0 ? '#10B981' : '#EF4444',
                        fontFamily: 'JetBrains Mono',
                      }}>
                        {result.aqi_reduction > 0 ? '+' : ''}{result.aqi_reduction.toFixed(1)} pts
                      </div>
                      <div style={{ fontSize: 11, color: '#10B981' }}>
                        {result.pct_improvement}% better
                      </div>
                    </div>

                    {/* After */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PREDICTED</div>
                      <div style={{
                        fontSize: 64, fontWeight: 900, color: predictedColor,
                        fontFamily: 'JetBrains Mono',
                        filter: `drop-shadow(0 0 16px ${predictedColor}60)`,
                      }}>
                        {Math.round(result.predicted_aqi)}
                      </div>
                      <div style={{ fontSize: 12, color: predictedColor }}>{result.predicted_category}</div>
                      {result.category_improved && (
                        <div style={{ fontSize: 12, color: '#10B981', marginTop: 4, fontWeight: 700 }}>
                          <CheckCircle size={12} className="inline-icon" /> Category improved!
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pollutant deltas */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      ['PM2.5', result.pm25_reduction, 'µg/m³'],
                      ['PM10',  result.pm10_reduction,  'µg/m³'],
                    ].map(([label, delta, unit]) => (
                      <div key={label} style={{
                        flex: 1, padding: '10px 14px',
                        background: 'rgba(16,185,129,0.08)',
                        border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: 10, textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', fontFamily: 'JetBrains Mono' }}>
                          {delta > 0 ? '+' : ''}{delta?.toFixed(2)} <span style={{ fontSize: 11 }}>{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Applied interventions */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><CheckCircle size={16} className="inline-icon" /> Interventions Applied</div>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(result.interventions_applied || []).map((iv, i) => (
                    <div key={i} style={{
                      padding: '10px 14px',
                      background: 'rgba(37,99,235,0.08)',
                      border: '1px solid rgba(37,99,235,0.15)',
                      borderRadius: 10,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{iv.intervention}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#10B981', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                        {iv.aqi_delta?.toFixed(1)} pts
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Health Impact */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><HeartPulse size={16} className="inline-icon" /> Estimated Health Impact</div>
                </div>
                <div className="card-body">
                  <div className="grid-2">
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: '#8B5CF6' }}>
                        {result.health_impact?.hospital_admissions_reduction_pct}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reduction in hospital admissions</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <div style={{ fontSize: 36, fontWeight: 900, color: '#10B981' }}>
                        {result.health_impact?.premature_deaths_reduction_pct}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reduction in premature deaths</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                    {result.note}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
