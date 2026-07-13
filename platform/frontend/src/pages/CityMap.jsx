import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CheckCircle, AlertTriangle, AlertOctagon, Skull, MapPin, Search, LineChart, ThermometerSun } from 'lucide-react';
import { api, aiApi, aqiColor, aqiCategory, formatAQI } from '../services/api';
import AQIGauge from '../components/AQIGauge';
import AttributionChart from '../components/AttributionChart';

export default function CityMap() {
  const [stations,    setStations]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [attribution, setAttribution] = useState(null);
  const [forecast,    setForecast]    = useState(null);
  const [filter,      setFilter]      = useState('all');
  const [loading,     setLoading]     = useState(true);
  const [sideLoading, setSideLoading] = useState(false);

  useEffect(() => {
    api.live().then(r => {
      setStations(r.data.stations || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleMarkerClick = async (s) => {
    setSelected(s);
    setSideLoading(true);
    setAttribution(null);
    setForecast(null);
    try {
      const [attr, fc] = await Promise.all([
        aiApi.attribution(s.name),
        aiApi.forecast(s.name),
      ]);
      setAttribution(attr.data);
      setForecast(fc.data);
    } catch {}
    setSideLoading(false);
  };

  const filteredStations = stations.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'good')      return (s.aqi || 0) <= 100;
    if (filter === 'moderate')  return (s.aqi || 0) > 100 && (s.aqi || 0) <= 200;
    if (filter === 'poor')      return (s.aqi || 0) > 200 && (s.aqi || 0) <= 300;
    if (filter === 'critical')  return (s.aqi || 0) > 300;
    return true;
  });

  const mapCenter = [22.5, 82.0]; // India center

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Left Panel: Map ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {/* Filter bar */}
        <div style={{
          position: 'absolute', top: 16, left: 16, zIndex: 1000,
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {[
            { key: 'all',      label: 'All', color: 'var(--blue-500)' },
            { key: 'good',     label: <><CheckCircle size={14} className="inline-icon" /> Good (≤100)</>, color: '#10B981' },
            { key: 'moderate', label: <><AlertTriangle size={14} className="inline-icon" /> Moderate</>, color: '#F59E0B' },
            { key: 'poor',     label: <><AlertOctagon size={14} className="inline-icon" /> Poor</>, color: '#EF4444' },
            { key: 'critical', label: <><Skull size={14} className="inline-icon" /> Critical</>, color: '#8B5CF6' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 12px',
                background: filter === f.key ? f.color + '33' : 'rgba(10,22,40,0.85)',
                border: `1px solid ${filter === f.key ? f.color : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 20,
                color: filter === f.key ? f.color : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
                transition: 'all 0.2s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Station count */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 1000,
          background: 'rgba(10,22,40,0.9)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 12,
          color: 'var(--text-secondary)',
          backdropFilter: 'blur(8px)',
        }}>
          Showing <strong style={{ color: 'var(--blue-300)' }}>{filteredStations.length}</strong> of {stations.length} stations
        </div>

        {loading ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'var(--navy-900)',
          }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading map data…</div>
          </div>
        ) : (
          <MapContainer
            center={mapCenter}
            zoom={5}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <ZoomControl position="bottomright" />
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            />
            {filteredStations.map((s) => {
              if (!s.latitude || !s.longitude) return null;
              const color  = aqiColor(s.aqi);
              const radius = Math.max(6, Math.min(20, (s.aqi || 50) / 20));
              return (
                <CircleMarker
                  key={s.station_id}
                  center={[s.latitude, s.longitude]}
                  radius={radius}
                  pathOptions={{
                    fillColor: color,
                    color:     color,
                    weight:    2,
                    fillOpacity: 0.75,
                    opacity: 1,
                  }}
                  eventHandlers={{ click: () => handleMarkerClick(s) }}
                >
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{s.name}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 8 }}>{s.city}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'JetBrains Mono' }}>
                          {formatAQI(s.aqi)}
                        </span>
                        <span className={`aqi-badge ${aqiCategory(s.aqi).toLowerCase().replace(' ','-')}`}>
                          {aqiCategory(s.aqi)}
                        </span>
                      </div>
                      {s.pm25 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>PM2.5: {s.pm25} µg/m³</div>}
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>

      {/* ── Right Panel: Station Detail ── */}
      <div style={{
        width: 340,
        background: 'var(--navy-950)',
        borderLeft: '1px solid var(--border)',
        overflow: 'auto',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {!selected ? (
          <div className="empty-state" style={{ flex: 1, justifyContent: 'center' }}>
            <div className="icon"><MapPin size={32} /></div>
            <h3>Select a Station</h3>
            <p>Click any marker on the map to see detailed AQI data, source attribution, and AI forecasts.</p>
          </div>
        ) : (
          <>
            {/* Station header */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                {selected.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{selected.city} · {selected.latitude?.toFixed(3)}, {selected.longitude?.toFixed(3)}</div>
            </div>

            {/* AQI Gauge */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <AQIGauge value={selected.aqi} size={200} />
            </div>

            {/* Pollutant pills */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['PM2.5', selected.pm25, 'µg/m³'],
                ['PM10', selected.pm10, 'µg/m³'],
                ['NO₂', selected.no2, 'µg/m³'],
                ['Wind', selected.wind_speed, 'km/h'],
              ].map(([label, val, unit]) => (
                <div key={label} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.5 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>
                    {val ? Number(val).toFixed(1) : '—'}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 3, fontFamily: 'Inter' }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="divider" />

            {/* Source Attribution */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                <Search size={14} className="inline-icon" /> Source Attribution
              </div>
              {sideLoading ? (
                <div className="skeleton" style={{ height: 180, borderRadius: 8 }} />
              ) : attribution ? (
                <AttributionChart attribution={attribution} size={160} />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Attribution data unavailable</div>
              )}
            </div>

            {/* Forecast pills */}
            {forecast && forecast.forecasts && (
              <>
                <div className="divider" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                    <LineChart size={14} className="inline-icon" /> AI Forecast
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {forecast.forecasts.map(f => {
                      const c = aqiColor(f.predicted_aqi);
                      return (
                        <div key={f.horizon} style={{
                          flex: 1,
                          background: `${c}18`,
                          border: `1px solid ${c}40`,
                          borderRadius: 10,
                          padding: '10px 8px',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>+{f.hours_ahead}h</div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: c, fontFamily: 'JetBrains Mono', margin: '4px 0' }}>
                            {Math.round(f.predicted_aqi)}
                          </div>
                          <div style={{ fontSize: 10, color: c }}>{f.trend}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
                            {(f.confidence * 100).toFixed(0)}% conf.
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Temperature widget */}
            {selected.temperature && (
              <>
                <div className="divider" />
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    [<ThermometerSun size={20} />, selected.temperature?.toFixed(1), '°C', 'Temperature'],
                  ].map(([icon, val, unit, label]) => (
                    <div key={label} style={{
                      flex: 1,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>
                          {val}{unit}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
