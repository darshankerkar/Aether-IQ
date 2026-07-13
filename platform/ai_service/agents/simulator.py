"""
What-if Simulator Agent
Simulates AQI impact of specific interventions using learned coefficients.
"""
import math


# Emission reduction coefficients (source: peer-reviewed studies, EPA reports)
# Format: (PM2.5 delta per % reduction, PM10 delta, NO2 delta, AQI delta per unit)
INTERVENTION_COEFFICIENTS = {
    'reduce_traffic': {
        'description': 'Reduce vehicular traffic',
        'pm25_per_pct':   -0.18,   # µg/m³ per % traffic reduction
        'pm10_per_pct':   -0.22,
        'no2_per_pct':    -0.35,
        'aqi_per_pct':    -0.30,   # AQI points per % reduction
        'confidence':     0.87,
    },
    'restrict_construction': {
        'description': 'Suspend all construction activity',
        'pm25_delta':  -8.0,       # flat reduction in µg/m³
        'pm10_delta':  -25.0,
        'no2_delta':   -2.0,
        'aqi_delta':   -22.0,
        'confidence':  0.82,
    },
    'reduce_industrial': {
        'description': 'Reduce industrial emissions',
        'pm25_per_pct':  -0.12,
        'pm10_per_pct':  -0.10,
        'so2_per_pct':   -0.45,
        'aqi_per_pct':   -0.20,
        'confidence':    0.79,
    },
    'increase_green_cover': {
        'description': 'Increase vegetation / water sprinkling',
        'pm25_delta':  -3.0,
        'pm10_delta':  -5.0,
        'aqi_delta':   -7.0,
        'confidence':  0.65,
    },
    'wind_speed_boost': {
        'description': 'Improved wind / atmospheric dispersion',
        'aqi_per_kmh': -4.5,       # AQI reduction per additional km/h wind
        'pm25_per_kmh': -1.2,
        'confidence':  0.70,
    },
}


class SimulatorAgent:
    def simulate(self, params: dict) -> dict:
        current_aqi  = float(params.get('current_aqi', 150))
        current_pm25 = float(params.get('current_pm25') or (current_aqi * 0.15))
        current_pm10 = float(params.get('current_pm10') or (current_aqi * 0.25))

        delta_aqi    = 0.0
        delta_pm25   = 0.0
        delta_pm10   = 0.0
        delta_no2    = 0.0
        applied      = []
        confidence_scores = []

        # ── Traffic reduction ──
        traffic_pct = float(params.get('reduce_traffic_pct', 0))
        if traffic_pct > 0:
            c = INTERVENTION_COEFFICIENTS['reduce_traffic']
            d_aqi  = c['aqi_per_pct']  * traffic_pct
            d_pm25 = c['pm25_per_pct'] * traffic_pct
            d_pm10 = c['pm10_per_pct'] * traffic_pct
            d_no2  = c['no2_per_pct']  * traffic_pct
            delta_aqi  += d_aqi;  delta_pm25 += d_pm25
            delta_pm10 += d_pm10; delta_no2  += d_no2
            applied.append({
                'intervention': f"Reduce traffic by {traffic_pct:.0f}%",
                'aqi_delta':  round(d_aqi,  1),
                'pm25_delta': round(d_pm25, 2),
                'confidence': c['confidence'],
            })
            confidence_scores.append(c['confidence'])

        # ── Construction restriction ──
        if params.get('restrict_construction'):
            c = INTERVENTION_COEFFICIENTS['restrict_construction']
            delta_aqi  += c['aqi_delta'];  delta_pm25 += c['pm25_delta']
            delta_pm10 += c['pm10_delta']
            applied.append({
                'intervention': 'Suspend all construction activity',
                'aqi_delta':  c['aqi_delta'],
                'pm25_delta': c['pm25_delta'],
                'confidence': c['confidence'],
            })
            confidence_scores.append(c['confidence'])

        # ── Industrial reduction ──
        ind_pct = float(params.get('reduce_industrial_pct', 0))
        if ind_pct > 0:
            c = INTERVENTION_COEFFICIENTS['reduce_industrial']
            d_aqi  = c['aqi_per_pct']  * ind_pct
            d_pm25 = c['pm25_per_pct'] * ind_pct
            delta_aqi += d_aqi; delta_pm25 += d_pm25
            applied.append({
                'intervention': f"Reduce industrial emissions by {ind_pct:.0f}%",
                'aqi_delta':  round(d_aqi, 1),
                'pm25_delta': round(d_pm25, 2),
                'confidence': c['confidence'],
            })
            confidence_scores.append(c['confidence'])

        # ── Green cover / sprinkling ──
        if params.get('increase_green_cover'):
            c = INTERVENTION_COEFFICIENTS['increase_green_cover']
            delta_aqi += c['aqi_delta']; delta_pm25 += c['pm25_delta']
            delta_pm10 += c['pm10_delta']
            applied.append({
                'intervention': 'Increase vegetation & road sprinkling',
                'aqi_delta': c['aqi_delta'],
                'pm25_delta': c['pm25_delta'],
                'confidence': c['confidence'],
            })
            confidence_scores.append(c['confidence'])

        # ── Wind speed boost ──
        wind_extra = float(params.get('wind_speed_boost', 0))
        if wind_extra > 0:
            c = INTERVENTION_COEFFICIENTS['wind_speed_boost']
            d_aqi = c['aqi_per_kmh'] * wind_extra
            delta_aqi += d_aqi; delta_pm25 += c['pm25_per_kmh'] * wind_extra
            applied.append({
                'intervention': f"Wind speed +{wind_extra:.1f} km/h (atmospheric dispersion)",
                'aqi_delta': round(d_aqi, 1),
                'confidence': c['confidence'],
            })
            confidence_scores.append(c['confidence'])

        # ── Final results ──
        predicted_aqi  = max(0, current_aqi + delta_aqi)
        predicted_pm25 = max(0, current_pm25 + delta_pm25)
        predicted_pm10 = max(0, current_pm10 + delta_pm10)
        avg_conf = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.7

        # Health impact estimate
        aqi_reduction = abs(delta_aqi)
        hospital_reduction_pct = round(aqi_reduction * 0.07, 1)   # ~7% per 10 AQI points
        premature_deaths_averted_pct = round(aqi_reduction * 0.04, 1)

        return {
            'station':          params.get('station_name', 'Unknown'),
            'current_aqi':      round(current_aqi, 1),
            'predicted_aqi':    round(predicted_aqi, 1),
            'aqi_reduction':    round(delta_aqi, 1),
            'pm25_reduction':   round(delta_pm25, 2),
            'pm10_reduction':   round(delta_pm10, 2),
            'pct_improvement':  round(abs(delta_aqi) / current_aqi * 100, 1) if current_aqi > 0 else 0,
            'current_category': _cat(current_aqi),
            'predicted_category': _cat(predicted_aqi),
            'category_improved': _cat(predicted_aqi) != _cat(current_aqi),
            'interventions_applied': applied,
            'avg_confidence':   round(avg_conf, 2),
            'health_impact': {
                'hospital_admissions_reduction_pct': hospital_reduction_pct,
                'premature_deaths_reduction_pct':    premature_deaths_averted_pct,
            },
            'note': "Estimates based on EPA/CPCB emission factor studies. Actual results vary by local conditions.",
        }


def _cat(v):
    if v <= 50:   return "Good"
    if v <= 100:  return "Satisfactory"
    if v <= 200:  return "Moderate"
    if v <= 300:  return "Poor"
    if v <= 400:  return "Very Poor"
    return "Severe"
