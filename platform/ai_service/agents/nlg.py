"""
Natural Language Generation (NLG) Agent
Generates human-readable explanations for AQI levels, without requiring an external LLM.
Structured rule-based system with rich contextual reasoning.
"""
from typing import Optional


def _cat(v):
    if v <= 50:   return "Good"
    if v <= 100:  return "Satisfactory"
    if v <= 200:  return "Moderate"
    if v <= 300:  return "Poor"
    if v <= 400:  return "Very Poor"
    return "Severe"


class NLGAgent:
    def explain(
        self,
        station_name: str,
        aqi: float,
        attribution: Optional[dict],
        forecast: Optional[dict],
    ) -> dict:
        """Generate structured AI explanation."""
        category = _cat(aqi)
        attr     = attribution or {}
        signals  = attr.get('signals', {})

        # Build evidence chain
        reasons  = self._build_reasons(aqi, attr, signals)
        outlook  = self._build_outlook(forecast, aqi)
        action   = self._build_action(aqi, attr)
        health   = self._health_advisory(aqi)

        # Summary sentence
        dominant = attr.get('dominant', 'mixed sources')
        wind     = signals.get('wind_speed_kmh', 'unknown')
        blh      = signals.get('boundary_layer_m', 'unknown')
        traffic_peak = signals.get('traffic_peak_hour', False)
        rain     = signals.get('rainfall_mm', 0) or 0

        summary_parts = []
        if aqi > 200:
            summary_parts.append(f"AQI has crossed the {category} threshold at {station_name}.")
        else:
            summary_parts.append(f"Air quality is currently {category} at {station_name} (AQI {aqi:.0f}).")

        if dominant != 'Mixed Sources':
            summary_parts.append(f"The primary driver is {dominant} emissions.")
        if isinstance(wind, (int, float)) and wind < 5:
            summary_parts.append(f"Weak winds ({wind:.1f} km/h) are trapping pollutants close to the surface.")
        if isinstance(blh, (int, float)) and blh < 600:
            summary_parts.append(f"A low atmospheric boundary layer ({blh:.0f}m) is preventing vertical dispersion.")
        if traffic_peak:
            summary_parts.append("Current peak traffic hours are intensifying road emissions.")
        if rain > 0:
            summary_parts.append(f"Recent rainfall ({rain:.1f}mm) has partially washed out particulates.")

        summary = " ".join(summary_parts)

        return {
            'station':     station_name,
            'aqi':         round(aqi, 1),
            'category':    category,
            'summary':     summary,
            'key_reasons': reasons,
            'outlook':     outlook,
            'recommended_action': action,
            'health_advisory':    health,
            'attribution':        attr,
            'generated_by':       'AQI Intelligence NLG Engine v1.0',
        }

    def _build_reasons(self, aqi, attr, signals) -> list:
        reasons = []
        wind  = signals.get('wind_speed_kmh', 5)
        blh   = signals.get('boundary_layer_m', 1000)
        no2   = signals.get('no2_ugm3', 0) or 0
        so2   = signals.get('so2_ugm3', 0) or 0
        rain  = signals.get('rainfall_mm', 0) or 0

        if isinstance(wind, (int, float)) and wind < 4:
            reasons.append({
                'factor': 'Low Wind Speed',
                'value': f"{wind:.1f} km/h",
                'impact': 'negative',
                'explanation': 'Stagnant air allows pollutants to accumulate rather than disperse.'
            })
        if isinstance(blh, (int, float)) and blh < 700:
            reasons.append({
                'factor': 'Low Boundary Layer Height',
                'value': f"{blh:.0f} m",
                'impact': 'negative',
                'explanation': 'Pollution is trapped in a shallow atmospheric layer near the ground.'
            })
        if attr.get('traffic', 0) > 35:
            reasons.append({
                'factor': 'High Traffic Contribution',
                'value': f"{attr['traffic']:.0f}%",
                'impact': 'negative',
                'explanation': f"Vehicular emissions are the dominant pollution source. NO₂: {no2:.1f} µg/m³."
            })
        if attr.get('industrial', 0) > 20:
            reasons.append({
                'factor': 'Industrial Emissions',
                'value': f"{attr['industrial']:.0f}%",
                'impact': 'negative',
                'explanation': f"Nearby industrial activity detected. SO₂: {so2:.1f} µg/m³."
            })
        if attr.get('construction', 0) > 20:
            reasons.append({
                'factor': 'Construction Dust',
                'value': f"{attr['construction']:.0f}%",
                'impact': 'negative',
                'explanation': 'Active construction sites generating coarse particulate matter (PM10).'
            })
        if isinstance(rain, (int, float)) and rain > 0:
            reasons.append({
                'factor': 'Recent Rainfall',
                'value': f"{rain:.1f} mm",
                'impact': 'positive',
                'explanation': 'Wet deposition partially removing particulates from the air.'
            })
        return reasons

    def _build_outlook(self, forecast, current_aqi) -> dict:
        if not forecast or not forecast.get('forecasts'):
            return {'summary': 'Forecast data unavailable.', 'trend': 'Unknown'}

        fc_24h = next((f for f in forecast['forecasts'] if f['horizon'] == '24h'), None)
        fc_72h = next((f for f in forecast['forecasts'] if f['horizon'] == '72h'), None)

        if not fc_24h:
            return {'summary': 'Forecast data unavailable.', 'trend': 'Unknown'}

        pred_24 = fc_24h['predicted_aqi']
        delta   = pred_24 - current_aqi
        trend   = 'Worsening' if delta > 15 else ('Improving' if delta < -15 else 'Stable')
        conf    = fc_24h.get('confidence', 0.7)

        parts = [f"In 24 hours, AQI is predicted to reach {pred_24:.0f} ({fc_24h['category']})."]
        if delta > 20:
            parts.append("Conditions are expected to worsen significantly — proactive intervention is critical.")
        elif delta < -20:
            parts.append("Air quality is expected to improve as meteorological conditions become favorable.")
        else:
            parts.append("No dramatic changes expected over the next 24 hours.")

        if fc_72h:
            parts.append(f"72-hour outlook: AQI {fc_72h['predicted_aqi']:.0f} (confidence: {fc_72h['confidence']*100:.0f}%).")

        return {
            'summary':      ' '.join(parts),
            'trend':        trend,
            'aqi_24h':      round(pred_24, 1),
            'aqi_72h':      round(fc_72h['predicted_aqi'], 1) if fc_72h else None,
            'confidence':   conf,
        }

    def _build_action(self, aqi, attr) -> str:
        dominant = attr.get('dominant', '').lower()
        if aqi > 300:
            return ("⚠️ EMERGENCY: Activate pollution emergency protocol. Restrict all heavy diesel traffic, "
                    "suspend construction, and issue public health advisory immediately.")
        if aqi > 200:
            if 'traffic' in dominant:
                return ("Impose immediate traffic restrictions. Ban heavy diesel trucks on key corridors. "
                        "Increase public transport frequency.")
            if 'industrial' in dominant:
                return ("Notify industrial units for emergency emission controls. "
                        "Deploy CPCB inspection teams to top 3 emitters.")
            return ("Issue odd-even vehicle advisory. Deploy water tankers on arterial roads. "
                    "Inspect top construction sites.")
        if aqi > 100:
            return ("Strengthen vehicle PUC checks. Mandate dust covers at construction sites. "
                    "Issue advisory for sensitive groups.")
        return "Maintain monitoring. No immediate action required. Encourage use of public transport."

    def _health_advisory(self, aqi) -> dict:
        if aqi <= 50:
            return {
                'risk': 'Low', 'color': '#10B981',
                'general': 'Air quality is satisfactory. No health precautions needed.',
                'sensitive_groups': 'Unusually sensitive individuals may experience minor respiratory symptoms.',
                'outdoor_activity': '✅ Safe for all activities.',
                'mask': 'Not required.',
            }
        if aqi <= 100:
            return {
                'risk': 'Low-Moderate', 'color': '#84CC16',
                'general': 'Air quality is acceptable.',
                'sensitive_groups': 'People with asthma or heart disease should limit prolonged outdoor exertion.',
                'outdoor_activity': '✅ Mostly safe. Limit prolonged exercise.',
                'mask': 'Optional for sensitive groups.',
            }
        if aqi <= 200:
            return {
                'risk': 'Moderate', 'color': '#F59E0B',
                'general': 'Members of sensitive groups may experience health effects.',
                'sensitive_groups': '⚠️ Avoid prolonged outdoor activity. Keep inhalers ready.',
                'outdoor_activity': '⚠️ Reduce outdoor exercise duration.',
                'mask': 'Recommended for sensitive groups outdoors.',
            }
        if aqi <= 300:
            return {
                'risk': 'High', 'color': '#EF4444',
                'general': 'Health alert: Everyone may experience more serious effects.',
                'sensitive_groups': '🚨 Stay indoors. Avoid all outdoor exertion.',
                'outdoor_activity': '❌ Avoid outdoor exercise.',
                'mask': '🚨 N95 mask mandatory for all outdoor activity.',
            }
        return {
            'risk': 'Critical', 'color': '#7C2D12',
            'general': '🚨 HEALTH EMERGENCY: Hazardous air quality.',
            'sensitive_groups': '🚨 Do not leave home. Use air purifiers.',
            'outdoor_activity': '❌ All outdoor activities prohibited.',
            'mask': '🚨 N95 mask mandatory. Avoid outdoor exposure entirely.',
        }
