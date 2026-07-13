import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, LineChart, Search, ShieldAlert, FlaskConical, Users, BarChart3, Wind } from 'lucide-react';

const NAV = [
  { section: 'Intelligence' },
  { to: '/',            icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { to: '/map',         icon: <Map size={18} />, label: 'City Map' },
  { to: '/forecast',    icon: <LineChart size={18} />, label: 'AQI Forecast' },
  { section: 'Analysis' },
  { to: '/attribution', icon: <Search size={18} />, label: 'Source Attribution' },
  { to: '/enforcement', icon: <ShieldAlert size={18} />, label: 'Enforcement' },
  { to: '/simulator',   icon: <FlaskConical size={18} />, label: 'What-if Simulator' },
  { section: 'Public' },
  { to: '/citizen',     icon: <Users size={18} />, label: 'Citizen Portal' },
  { to: '/analytics',   icon: <BarChart3 size={18} />, label: 'Analytics' },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="logo-area">
        <div className="logo-badge">
          <img src="/AetherIQ%20logo.png" alt="AetherIQ Logo" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'contain' }} />
          <div>
            <div className="logo-text">AetherIQ</div>
            <div className="logo-sub">Forecast. Act. Improve.</div>
          </div>
        </div>
      </div>

      <div className="nav-section">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-label">{item.section}</div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon" style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </div>

      <div className="sidebar-footer">
        <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11 }}>
          CPCB • OpenAQ • Open-Meteo
        </div>
        <div>Data refreshed every 15 min</div>
        <div style={{ marginTop: 6 }}>
          <div className="live-indicator">
            <div className="live-dot" />
            Live Monitoring Active
          </div>
        </div>
      </div>
    </nav>
  );
}
