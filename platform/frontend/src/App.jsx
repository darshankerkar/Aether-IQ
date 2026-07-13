import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard    from './pages/Dashboard';
import CityMap      from './pages/CityMap';
import Forecast     from './pages/Forecast';
import Attribution  from './pages/Attribution';
import Enforcement  from './pages/Enforcement';
import Simulator    from './pages/Simulator';
import Citizen      from './pages/Citizen';
import Analytics    from './pages/Analytics';

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/map"         element={<CityMap />} />
            <Route path="/forecast"    element={<Forecast />} />
            <Route path="/attribution" element={<Attribution />} />
            <Route path="/enforcement" element={<Enforcement />} />
            <Route path="/simulator"   element={<Simulator />} />
            <Route path="/citizen"     element={<Citizen />} />
            <Route path="/analytics"   element={<Analytics />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
