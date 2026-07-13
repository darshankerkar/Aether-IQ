"""
Recommendation Agent — Generates ranked enforcement actions with estimated AQI reduction.
"""
from typing import Optional


ACTION_LIBRARY = [
    # action, target_source, aqi_delta, priority, confidence, description
    ("Impose emergency ban on heavy diesel trucks",
     "traffic", -28, "high", 0.91,
     "Heavy diesel vehicles contribute ~35% of NOx in urban corridors"),
    ("Deploy road-watering tankers on all arterial roads",
     "construction", -15, "high", 0.87,
     "Dust suppression reduces PM10 by 30–45% within 2-hour windows"),
    ("Suspend construction activity within 1km radius",
     "construction", -22, "high", 0.85,
     "Active construction sites generate 2.5× baseline dust levels"),
    ("Mandate wet bag filters at industrial stacks",
     "industrial", -18, "high", 0.82,
     "Wet scrubbers reduce particulate emissions by 60–80%"),
    ("Activate emergency industrial emission controls",
     "industrial", -14, "high", 0.80,
     "Emergency protocols reduce SO2 output by 40% within 4 hours"),
    ("Restrict trucks to night-time hours (10PM–6AM)",
     "traffic", -18, "medium", 0.84,
     "Temporal diversion reduces daytime NO2 peaks by 25%"),
    ("Implement odd-even vehicle scheme on congested corridors",
     "traffic", -12, "medium", 0.75,
     "Reduces vehicle density by 40–50% on targeted roads"),
    ("Increase road-watering frequency to 3× per shift",
     "construction", -10, "medium", 0.78,
     "Frequent sprinkling prevents dust resuspension during dry periods"),
    ("Inspect top 5 construction sites for dust compliance",
     "construction", -12, "medium", 0.73,
     "Surprise inspections improve compliance by 60% within 48 hours"),
    ("Issue advisory to reduce industrial furnace operations",
     "industrial", -9, "medium", 0.70,
     "Voluntary reduction achieves 15–20% emission cuts"),
    ("Plant temporary windbreakers (jute nets) at construction perimeters",
     "construction", -7, "low", 0.68,
     "Dust barriers capture 40% of fugitive dust at site boundaries"),
    ("Increase green cover watering in nearby parks",
     "natural", -4, "low", 0.60,
     "Moist vegetation traps particulates; reduces local PM2.5 by 5–8%"),
    ("Strengthen vehicle PUC checks at 5 key entry points",
     "traffic", -6, "low", 0.65,
     "Removes high-emitting vehicles; reduces NOx by 10% over 72 hours"),
    ("Issue work-from-home advisory to IT sector",
     "traffic", -5, "low", 0.58,
     "20% traffic reduction achievable with WFH advisory compliance"),
]


class RecommendationAgent:
    def generate(
        self,
        station_name: str,
        attribution: Optional[dict],
        forecast: Optional[dict],
    ) -> dict:
        """Generate ranked recommendations based on dominant pollution source."""
        if not attribution:
            attribution = {'traffic': 40, 'industrial': 20, 'construction': 25, 'others': 15}

        dominant  = attribution.get('dominant', 'Traffic').lower()
        current   = forecast.get('current_aqi', 150) if forecast else 150
        forecast_24h = next(
            (f['predicted_aqi'] for f in (forecast or {}).get('forecasts', []) if f['horizon'] == '24h'),
            current
        )
        aqi_trending_up = forecast_24h > current * 1.08

        recommendations = []
        for (action, source, delta, priority, conf, rationale) in ACTION_LIBRARY:
            # Boost priority if source matches dominant attribution
            if source in dominant:
                priority = 'high' if priority != 'high' else 'high'
                conf = min(0.99, conf + 0.05)
            # Boost urgency if AQI trending up
            if aqi_trending_up and priority == 'medium':
                priority = 'high'

            recommendations.append({
                'action':             action,
                'source_category':    source,
                'expected_aqi_delta': delta,
                'priority':           priority,
                'confidence':         round(conf, 2),
                'rationale':          rationale,
                'urgency':            'Immediate' if priority == 'high' else ('Within 24h' if priority == 'medium' else 'Advisory'),
                'impact_window':      '2–6 hours' if priority == 'high' else '6–24 hours',
            })

        # Sort: high priority first, then by AQI reduction magnitude
        recommendations.sort(key=lambda r: (
            {'high': 0, 'medium': 1, 'low': 2}[r['priority']],
            r['expected_aqi_delta']   # negative = bigger reduction = better
        ))

        # Total estimated reduction if top 3 high-priority actions taken
        top_3 = [r for r in recommendations if r['priority'] == 'high'][:3]
        total_reduction = sum(r['expected_aqi_delta'] for r in top_3)

        return {
            'station':                station_name,
            'current_aqi':            round(current, 1),
            'forecast_24h_aqi':       round(forecast_24h, 1),
            'trending':               'Up ↑' if aqi_trending_up else 'Stable →',
            'dominant_source':        attribution.get('dominant', 'Unknown'),
            'recommendations':        recommendations,
            'estimated_max_reduction': round(total_reduction, 1),
            'if_all_implemented_aqi': round(max(0, current + total_reduction), 1),
        }
