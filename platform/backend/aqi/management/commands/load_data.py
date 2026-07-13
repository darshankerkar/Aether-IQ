"""
Management command: load_data
Loads india_master_features.csv into Django DB.
Usage:  python manage.py load_data [--days 7] [--clear]
"""
import os
import pandas as pd
import numpy as np
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from django.db import transaction

from aqi.models import City, AQIStation, AQIReading, Recommendation, CitizenAlert


def india_aqi(pm25=None, pm10=None, no2=None, so2=None, co=None, o3=None):
    """
    Compute India AQI (CPCB method) — max of sub-indices.
    Using simplified linear interpolation per pollutant.
    """
    def pm25_aqi(c):
        if c is None or np.isnan(c): return None
        breakpoints = [(0,30,0,50),(30,60,51,100),(60,90,101,200),(90,120,201,300),(120,250,301,400),(250,500,401,500)]
        for cl, ch, il, ih in breakpoints:
            if cl <= c <= ch:
                return il + (ih - il) * (c - cl) / (ch - cl)
        return 500

    def pm10_aqi(c):
        if c is None or np.isnan(c): return None
        breakpoints = [(0,50,0,50),(50,100,51,100),(100,250,101,200),(250,350,201,300),(350,430,301,400),(430,600,401,500)]
        for cl, ch, il, ih in breakpoints:
            if cl <= c <= ch:
                return il + (ih - il) * (c - cl) / (ch - cl)
        return 500

    sub_indices = list(filter(None, [
        pm25_aqi(pm25),
        pm10_aqi(pm10),
    ]))
    return max(sub_indices) if sub_indices else None


class Command(BaseCommand):
    help = 'Load AQI + weather data from india_master_features.csv into the database'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=7,
                            help='How many days of data to load (default: 7)')
        parser.add_argument('--clear', action='store_true',
                            help='Clear existing readings before loading')

    def handle(self, *args, **options):
        days  = options['days']
        clear = options['clear']

        csv_path = settings.PROCESSED_DATA_DIR / 'india_master_features.csv'
        if not csv_path.exists():
            self.stderr.write(self.style.ERROR(f"File not found: {csv_path}"))
            return

        self.stdout.write(f"Loading {csv_path}…")
        df = pd.read_csv(csv_path, parse_dates=['timestamp'])

        # Filter to recent N days
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        cutoff = df['timestamp'].max() - timedelta(days=days)
        df = df[df['timestamp'] >= cutoff].copy()
        self.stdout.write(f"  Rows after filtering to last {days} days: {len(df):,}")

        if clear:
            self.stdout.write("  Clearing existing readings…")
            AQIReading.objects.all().delete()

        # ──────────────────────────────────────────
        # Step 1: Create / update stations & cities
        # ──────────────────────────────────────────
        self.stdout.write("  Creating stations and cities…")
        station_map = {}  # name → AQIStation

        unique_stations = df[['location', 'latitude', 'longitude', 'location_id']].drop_duplicates('location')

        for _, row in unique_stations.iterrows():
            loc_name = str(row['location'])

            # Derive city name (last part after last '-')
            parts = loc_name.split('-')
            provider = parts[-1].strip() if len(parts) > 1 else ''
            city_part = parts[0].strip() if len(parts) > 1 else loc_name

            city, _ = City.objects.get_or_create(
                name=city_part,
                defaults={'state': '', 'latitude': row['latitude'], 'longitude': row['longitude']}
            )

            station, created = AQIStation.objects.get_or_create(
                station_id=str(int(row['location_id'])) if pd.notna(row['location_id']) else loc_name[:50],
                defaults={
                    'name':      loc_name,
                    'city':      city,
                    'latitude':  float(row['latitude']),
                    'longitude': float(row['longitude']),
                    'provider':  provider,
                    'is_active': True,
                }
            )
            station_map[loc_name] = station

        self.stdout.write(f"  Stations in DB: {AQIStation.objects.count()}")

        # ──────────────────────────────────────────
        # Step 2: Load readings in bulk
        # ──────────────────────────────────────────
        self.stdout.write("  Loading readings (bulk insert)…")

        # Rename weather columns
        col_map = {
            'aqi_pm25': 'pm25', 'aqi_pm10': 'pm10',
            'aqi_no2': 'no2', 'aqi_so2': 'so2', 'aqi_co': 'co', 'aqi_o3': 'o3',
            'wx_temperature_2m': 'temperature',
            'wx_relativehumidity_2m': 'humidity',
            'wx_windspeed_10m': 'wind_speed',
            'wx_winddirection_10m': 'wind_dir',
            'wx_precipitation': 'precipitation',
            'wx_surface_pressure': 'pressure',
            'wx_boundary_layer_height': 'boundary_layer_height',
            'wx_cloudcover': 'cloud_cover',
        }
        df = df.rename(columns=col_map)

        # Compute AQI from pollutants
        def compute_row_aqi(r):
            return india_aqi(
                pm25=r.get('pm25'), pm10=r.get('pm10')
            )

        df['aqi_value'] = df.apply(compute_row_aqi, axis=1)

        existing = set(
            AQIReading.objects.values_list('station_id', 'timestamp')
        )

        to_create = []
        skipped   = 0

        for _, row in df.iterrows():
            loc_name = str(row['location'])
            station  = station_map.get(loc_name)
            if not station:
                continue

            ts = row['timestamp']
            if (station.id, ts) in existing:
                skipped += 1
                continue

            aqi_val = row.get('aqi_value')
            to_create.append(AQIReading(
                station   = station,
                timestamp = ts,
                pm25      = _f(row.get('pm25')),
                pm10      = _f(row.get('pm10')),
                no2       = _f(row.get('no2')),
                so2       = _f(row.get('so2')),
                co        = _f(row.get('co')),
                o3        = _f(row.get('o3')),
                aqi_value    = _f(aqi_val),
                aqi_category = _cat(aqi_val),
                temperature   = _f(row.get('temperature')),
                humidity      = _f(row.get('humidity')),
                wind_speed    = _f(row.get('wind_speed')),
                wind_dir      = _f(row.get('wind_dir')),
                precipitation = _f(row.get('precipitation')),
                pressure      = _f(row.get('pressure')),
                boundary_layer_height = _f(row.get('boundary_layer_height')),
                cloud_cover   = _f(row.get('cloud_cover')),
                hour_of_day   = int(row['hour_of_day']) if pd.notna(row.get('hour_of_day')) else None,
                day_of_week   = int(row['day_of_week']) if pd.notna(row.get('day_of_week')) else None,
                is_weekend    = bool(row.get('is_weekend', False)),
                month         = int(row['month']) if pd.notna(row.get('month')) else None,
            ))

        # Bulk insert in chunks of 5000
        CHUNK = 5000
        self.stdout.write(f"  Inserting {len(to_create):,} readings (skipping {skipped:,} existing)…")
        with transaction.atomic():
            for i in range(0, len(to_create), CHUNK):
                AQIReading.objects.bulk_create(to_create[i:i+CHUNK], ignore_conflicts=True)
                self.stdout.write(f"    … {min(i+CHUNK, len(to_create)):,}/{len(to_create):,}")

        self.stdout.write(self.style.SUCCESS(
            f"  Done! {AQIReading.objects.count():,} total readings in DB."
        ))

        # ──────────────────────────────────────────
        # Step 3: Generate static recommendations
        # ──────────────────────────────────────────
        self.stdout.write("  Generating recommendations…")
        _generate_recommendations(station_map)

        # ──────────────────────────────────────────
        # Step 4: Generate citizen alerts
        # ──────────────────────────────────────────
        self.stdout.write("  Generating citizen alerts…")
        _generate_alerts(station_map)

        self.stdout.write(self.style.SUCCESS("Done! Data loading complete."))


def _f(val):
    """Return float or None, handling NaN."""
    if val is None: return None
    try:
        v = float(val)
        return None if np.isnan(v) else v
    except (TypeError, ValueError):
        return None


def _cat(val):
    if val is None: return "Unknown"
    v = float(val)
    if v <= 50:  return "Good"
    if v <= 100: return "Satisfactory"
    if v <= 200: return "Moderate"
    if v <= 300: return "Poor"
    if v <= 400: return "Very Poor"
    return "Severe"


def _generate_recommendations(station_map):
    """Generate rule-based enforcement recommendations per station."""
    Recommendation.objects.all().delete()

    actions_by_category = {
        "Severe": [
            ("Impose emergency traffic restrictions on heavy diesel vehicles", -28, "high", 0.91),
            ("Deploy water sprinkler trucks on all arterial roads", -15, "high", 0.88),
            ("Suspend all construction activity within 1km radius", -22, "high", 0.85),
            ("Activate emergency industrial emission controls", -18, "high", 0.82),
        ],
        "Very Poor": [
            ("Restrict trucks to night-time hours only (10PM–6AM)", -18, "high", 0.87),
            ("Increase road-watering frequency to 3× per shift", -10, "high", 0.84),
            ("Inspect top 5 construction sites for dust compliance", -12, "high", 0.79),
            ("Issue advisory to reduce industrial furnace operations", -9, "medium", 0.73),
        ],
        "Poor": [
            ("Recommend odd-even vehicle scheme on congested corridors", -12, "medium", 0.75),
            ("Mandate water-sprinkling at all construction sites", -8, "medium", 0.78),
            ("Increase green cover watering in parks", -4, "low", 0.65),
        ],
        "Moderate": [
            ("Strengthen vehicle PUC checks at entry points", -6, "medium", 0.70),
            ("Encourage work-from-home advisory for this area", -5, "low", 0.62),
        ],
    }

    recs = []
    for name, station in station_map.items():
        latest = station.readings.order_by('-timestamp').first()
        if not latest:
            continue
        cat = latest.aqi_category
        aqi_display = f"{latest.aqi_value:.0f}" if latest.aqi_value is not None else "N/A"
        for action, delta, priority, conf in actions_by_category.get(cat, actions_by_category["Moderate"]):
            recs.append(Recommendation(
                station=station,
                action=action,
                rationale=f"Station {name} is in {cat} category (AQI≈{aqi_display}). "
                          f"This intervention targets the primary pollution source at this location.",
                expected_aqi_delta=delta,
                priority=priority,
                confidence=conf,
            ))

    Recommendation.objects.bulk_create(recs)


def _generate_alerts(station_map):
    """Generate citizen alerts for stations with high AQI."""
    CitizenAlert.objects.all().delete()

    alerts = []
    for name, station in station_map.items():
        latest = station.readings.order_by('-timestamp').first()
        if not latest or not latest.aqi_value:
            continue
        aqi = latest.aqi_value
        cat = latest.aqi_category

        if aqi <= 100:
            risk = "low"
            msg_en = f"Air quality is {cat} at {name}. Safe for outdoor activities."
            msg_hi = f"{name} पर वायु गुणवत्ता {cat} है। बाहरी गतिविधियाँ सुरक्षित हैं।"
            advisory = "No special precautions needed."
        elif aqi <= 200:
            risk = "moderate"
            msg_en = f"Moderate air quality at {name} (AQI {aqi:.0f}). Sensitive groups should limit outdoor exposure."
            msg_hi = f"{name} पर AQI {aqi:.0f} है। संवेदनशील व्यक्ति बाहर कम समय बिताएं।"
            advisory = "People with asthma or heart conditions should avoid prolonged outdoor activity."
        elif aqi <= 300:
            risk = "high"
            msg_en = f"Poor air quality at {name} (AQI {aqi:.0f}). Avoid outdoor exercise. Wear N95 masks."
            msg_hi = f"{name} पर वायु प्रदूषण खराब है (AQI {aqi:.0f})। N95 मास्क पहनें।"
            advisory = "Schools and hospitals advised to keep indoor. Avoid strenuous activity outdoors."
        else:
            risk = "critical"
            msg_en = f"CRITICAL: Severe air quality at {name} (AQI {aqi:.0f}). Stay indoors. All outdoor activity prohibited."
            msg_hi = f"खतरा: {name} पर वायु प्रदूषण गंभीर है (AQI {aqi:.0f})। घर के अंदर रहें।"
            advisory = "Emergency health advisory. Schools closed. Outdoor gatherings banned. Use air purifiers."

        alerts.append(CitizenAlert(
            station=station,
            risk_level=risk,
            aqi_value=aqi,
            message_en=msg_en,
            message_hi=msg_hi,
            advisory=advisory,
        ))

    CitizenAlert.objects.bulk_create(alerts)
