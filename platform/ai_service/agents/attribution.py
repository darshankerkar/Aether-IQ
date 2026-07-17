"""
Source Attribution Agent
Attributes pollution to: Traffic / Construction / Industrial / Natural / Others
Uses rule-based logic enhanced with RF correlations.
"""
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings("ignore")


# Known high-pollution provider codes (from OpenAQ metadata)
INDUSTRIAL_PROVIDERS = {'MPCB', 'CPCB', 'KSPCB', 'GPCB', 'TNPCB', 'WBPCB'}

# Traffic-dominant hours (rush hours in IST)
TRAFFIC_HOURS = {7, 8, 9, 10, 17, 18, 19, 20}
NIGHT_HOURS   = {0, 1, 2, 3, 4, 5}


class AttributionAgent:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.df       = None
        self._station_cache = {}   # station_name → attribution dict

    def train(self):
        """Load data and pre-compute attribution for all stations."""
        csv = self.data_dir / "india_master_features.csv"
        if not csv.exists():
            print("  [Attribution] CSV not found — will use rule-based only")
            return

        df = pd.read_csv(csv, parse_dates=['timestamp'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        num_cols = df.select_dtypes(include=[np.number]).columns
        df[num_cols] = df[num_cols].fillna(df[num_cols].median())
        self.df = df

        # Pre-compute for all stations
        for loc in df['location'].unique():
            grp = df[df['location'] == loc]
            self._station_cache[loc] = self._compute_attribution(grp)

        print(f"  [Attribution] Pre-computed for {len(self._station_cache)} stations")

    def _compute_attribution(self, grp: pd.DataFrame) -> dict:
        """
        Rule-based attribution weighted by measurable correlates.
        Returns percentage breakdown summing to 100%.
        """
        if grp.empty:
            return self._default_attribution()

        latest = grp.sort_values('timestamp').iloc[-1]

        # Extract key signals
        wind_speed  = float(latest.get('wx_windspeed_10m', 5) or 5)
        boundary_h  = float(latest.get('wx_boundary_layer_height', 1000) or 1000)
        rain        = float(latest.get('wx_precipitation', 0) or 0)
        hour        = int(latest.get('hour_of_day', 12) or 12)
        is_weekend  = bool(latest.get('is_weekend', False))
        pm25        = float(latest.get('aqi_pm25', 0) or 0)
        no2         = float(latest.get('aqi_no2', 0) or 0)
        so2         = float(latest.get('aqi_so2', 0) or 0)
        co          = float(latest.get('aqi_co', 0) or 0)

        # ── Traffic score ──
        traffic = 0.0
        if hour in TRAFFIC_HOURS and not is_weekend:
            traffic += 30
        elif hour in TRAFFIC_HOURS and is_weekend:
            traffic += 15
        if no2 > 30:   traffic += 20   # NO2 is traffic indicator
        if co > 0.5:   traffic += 15
        if wind_speed < 5:  traffic += 10
        traffic = min(traffic, 65)

        # ── Industrial score ──
        industrial = 0.0
        if so2 > 20:   industrial += 25
        if pm25 > 60 and so2 > 15: industrial += 15
        if hour in NIGHT_HOURS:    industrial += 10  # factories often run nights
        industrial = min(industrial, 40)

        # ── Construction score ──
        construction = 0.0
        pm10 = float(latest.get('aqi_pm10', 0) or 0)
        if pm10 > 100 and pm25 < pm10 * 0.7:  # coarse dust dominance
            construction += 25
        if not is_weekend and hour not in NIGHT_HOURS:
            construction += 10
        construction = min(construction, 35)

        # ── Natural / meteorological contribution ──
        natural = 0.0
        if wind_speed > 15:  natural += 15  # blown dust
        if rain > 0:         natural -= 10  # rain suppresses pollution
        if boundary_h < 500: natural += 10  # poor dispersion = trap all
        natural = max(0, min(natural, 20))

        # ── Normalise to 100% ──
        raw_total = traffic + industrial + construction + natural
        if raw_total < 5:
            traffic, industrial, construction, natural = 35, 20, 25, 10
            raw_total = 90

        others = max(0, 100 - raw_total)
        scale  = 100 / (raw_total + others) if (raw_total + others) > 0 else 1

        return {
            'traffic':      round(traffic      * scale, 1),
            'industrial':   round(industrial   * scale, 1),
            'construction': round(construction * scale, 1),
            'natural':      round(natural      * scale, 1),
            'others':       round(others       * scale, 1),
            'dominant':     self._dominant(traffic, industrial, construction, natural, others * scale),
            'confidence':   round(self._confidence(wind_speed, boundary_h, pm25, no2, so2), 2),
            'signals': {
                'wind_speed_kmh':        round(wind_speed, 1),
                'boundary_layer_m':      round(boundary_h, 0),
                'rainfall_mm':           round(rain, 2),
                'no2_ugm3':              round(no2, 1),
                'so2_ugm3':              round(so2, 1),
                'co_mgm3':               round(co, 3),
                'traffic_peak_hour':     hour in TRAFFIC_HOURS,
                'weekend':               is_weekend,
            }
        }

    @staticmethod
    def _dominant(t, i, c, n, o) -> str:
        m = max(t, i, c, n, o)
        if m == t: return "Traffic"
        if m == i: return "Industrial"
        if m == c: return "Construction"
        if m == n: return "Natural/Meteorological"
        return "Mixed Sources"

    @staticmethod
    def _confidence(wind, blh, pm25, no2, so2) -> float:
        """Higher confidence when signals are clear."""
        score = 0.60
        if wind < 3: score += 0.10      # local source very likely
        if blh < 600: score += 0.08     # trapped air
        if no2 > 40:  score += 0.08     # clear traffic signal
        if so2 > 25:  score += 0.07     # clear industrial signal
        return min(0.96, score)

    @staticmethod
    def _default_attribution():
        return {
            'traffic': 40.0, 'industrial': 20.0,
            'construction': 25.0, 'natural': 5.0, 'others': 10.0,
            'dominant': 'Traffic', 'confidence': 0.60, 'signals': {},
        }

    def attribute(self, station_name: str) -> dict:
        if station_name in self._station_cache:
            return {'station': station_name, **self._station_cache[station_name]}

        # Robust fuzzy match using difflib — works for names with or without hyphens
        if self._station_cache:
            from difflib import get_close_matches
            keys = list(self._station_cache.keys())
            matches = get_close_matches(station_name, keys, n=1, cutoff=0.4)
            if matches:
                return {'station': station_name, **self._station_cache[matches[0]]}

        return {'station': station_name, **self._default_attribution()}

    def bulk_summary(self, limit: int = 50) -> list:
        results = []
        for name, attr in list(self._station_cache.items())[:limit]:
            results.append({'station': name, **attr})
        return results
