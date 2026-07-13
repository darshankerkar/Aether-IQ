import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { aqiColor } from '../services/api';

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
);

export default function ForecastChart({ readings = [], forecasts = [], pollutant = 'aqi' }) {
  const pollutantKey = {
    aqi:  'aqi_value',
    pm25: 'pm25',
    pm10: 'pm10',
    no2:  'no2',
  }[pollutant] || 'aqi_value';

  // Historical data
  const histLabels = readings.slice(-48).map(r => {
    const d = new Date(r.timestamp);
    return `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:00`;
  });
  const histValues = readings.slice(-48).map(r => r[pollutantKey] || r.aqi_value || null);

  // Forecast points
  const fcLabels = forecasts.map(f => `+${f.hours_ahead}h`);
  const fcValues = forecasts.map(f => f.predicted_aqi);

  const allLabels = [...histLabels, ...fcLabels];
  const histPadded = [...histValues, ...Array(fcLabels.length).fill(null)];
  const fcPadded   = [...Array(histLabels.length).fill(null), ...fcValues];

  // Gradient fill color
  const lastAQI = histValues.filter(Boolean).pop() || 150;
  const lineColor = aqiColor(lastAQI);

  const data = {
    labels: allLabels,
    datasets: [
      {
        label: 'Historical AQI',
        data: histPadded,
        borderColor: 'rgba(96, 165, 250, 0.8)',
        backgroundColor: (ctx) => {
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'transparent';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(37, 99, 235, 0.3)');
          gradient.addColorStop(1, 'rgba(37, 99, 235, 0.01)');
          return gradient;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: false,
      },
      {
        label: 'AI Forecast',
        data: fcPadded,
        borderColor: lineColor,
        backgroundColor: `${lineColor}22`,
        fill: false,
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
        borderWidth: 2.5,
        borderDash: [6, 3],
        pointBackgroundColor: lineColor,
        pointBorderColor: 'var(--navy-900)',
        pointBorderWidth: 2,
        spanGaps: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: {
          color: 'rgba(148,163,184,0.9)',
          font: { family: 'Inter', size: 12 },
          boxWidth: 12,
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(10,22,40,0.95)',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        titleFont: { family: 'Inter', weight: '600', size: 12 },
        bodyFont:  { family: 'Inter', size: 12 },
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw !== null ? ctx.raw.toFixed(1) : 'N/A'}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(148,163,184,0.6)',
          font: { family: 'Inter', size: 10 },
          maxTicksLimit: 12,
        },
        grid: { color: 'rgba(255,255,255,0.04)' },
      },
      y: {
        ticks: {
          color: 'rgba(148,163,184,0.6)',
          font: { family: 'Inter', size: 11 },
        },
        grid: { color: 'rgba(255,255,255,0.04)' },
        title: {
          display: true,
          text: pollutant.toUpperCase() + (pollutant !== 'aqi' ? ' (µg/m³)' : ''),
          color: 'rgba(148,163,184,0.5)',
          font: { family: 'Inter', size: 11 },
        },
      },
    },
  };

  return (
    <div className="chart-container" style={{ height: 240 }}>
      <Line data={data} options={options} />
    </div>
  );
}
