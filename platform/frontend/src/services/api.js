import axios from 'axios';

const DJANGO = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 15000,
});

const AI = axios.create({
  baseURL: 'http://localhost:8001',
  timeout: 30000,
});

// ── Django API ──────────────────────────────────────
export const api = {
  kpis:          ()          => DJANGO.get('/kpis/'),
  live:          ()          => DJANGO.get('/live/'),
  citySummary:   ()          => DJANGO.get('/city-summary/'),
  trends:        (hours=24)  => DJANGO.get(`/trends/?hours=${hours}`),
  stations:      ()          => DJANGO.get('/stations/'),
  station:       (id)        => DJANGO.get(`/stations/${id}/`),
  readings:      (id, h=72)  => DJANGO.get(`/stations/${id}/readings/?hours=${h}`),
  recommendations: (city='') => DJANGO.get(`/recommendations/?city=${city}`),
  alerts:        ()          => DJANGO.get('/alerts/'),
  cities:        ()          => DJANGO.get('/cities/'),
};

// ── FastAPI AI Service ───────────────────────────────
export const aiApi = {
  forecast:       (stationName) => AI.get(`/forecast/${encodeURIComponent(stationName)}`),
  attribution:    (stationName) => AI.get(`/attribution/${encodeURIComponent(stationName)}`),
  recommendations:(stationName) => AI.get(`/recommendations/${encodeURIComponent(stationName)}`),
  explain:        (stationName, aqi) => AI.get(`/explain/${encodeURIComponent(stationName)}?aqi=${aqi}`),
  simulate:       (payload)     => AI.post('/simulate', payload),
  bulkAttribution:()            => AI.get('/bulk-attribution?limit=100'),
  health:         ()            => AI.get('/health'),
};

// ── Utility Helpers ──────────────────────────────────
export function aqiColor(aqi) {
  if (!aqi) return '#64748B';
  if (aqi <= 50)  return '#10B981';
  if (aqi <= 100) return '#84CC16';
  if (aqi <= 200) return '#F59E0B';
  if (aqi <= 300) return '#EF4444';
  if (aqi <= 400) return '#8B5CF6';
  return '#F87171';
}

export function aqiCategory(aqi) {
  if (!aqi) return 'Unknown';
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 200) return 'Moderate';
  if (aqi <= 300) return 'Poor';
  if (aqi <= 400) return 'Very Poor';
  return 'Severe';
}

export function aqiBadgeClass(cat) {
  if (!cat) return '';
  return cat.toLowerCase().replace(' ', '-');
}

export function formatAQI(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v);
}
