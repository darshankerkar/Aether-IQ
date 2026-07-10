import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import time
import os

# ============================================================
# Configuration
# ============================================================
BASE_URL       = "https://archive-api.open-meteo.com/v1/archive"
DAYS_BACK      = 30
REQUEST_DELAY  = 0.2   # Seconds between requests
OUTPUT_FILE     = "../data/raw/india_weather_hourly.csv"
CHECKPOINT_FILE = "../data/raw/india_weather_checkpoint.csv"

# Source of station locations — use AQI data (final or checkpoint)
AQI_FINAL      = "../data/raw/india_aqi_hourly.csv"
AQI_CHECKPOINT = "../data/raw/india_aqi_checkpoint.csv"

# Hourly variables to fetch from Open-Meteo
HOURLY_VARS = [
    "temperature_2m",           # Air temperature (°C)
    "relativehumidity_2m",      # Relative humidity (%)
    "dewpoint_2m",              # Dewpoint temp (°C)
    "precipitation",            # Precipitation (mm)
    "surface_pressure",         # Surface pressure (hPa)
    "windspeed_10m",            # Wind speed at 10m (km/h)
    "winddirection_10m",        # Wind direction at 10m (°)
    "windgusts_10m",            # Wind gusts at 10m (km/h)
    "boundary_layer_height",    # Atmospheric boundary layer height (m) — key for AQI!
    "shortwave_radiation",      # Solar radiation (W/m²)
    "cloudcover",               # Total cloud cover (%)
]


# ============================================================
# Helpers
# ============================================================
def get_station_locations():
    """Load unique station lat/lon from AQI data (final or checkpoint)."""
    source = None
    if os.path.exists(AQI_FINAL):
        source = AQI_FINAL
    elif os.path.exists(AQI_CHECKPOINT):
        source = AQI_CHECKPOINT
    else:
        raise FileNotFoundError(
            "No AQI data found. Run ingest_aqi.py first (or wait for checkpoint)."
        )

    df = pd.read_csv(source, usecols=["location", "latitude", "longitude"])
    locations = (
        df.dropna(subset=["latitude", "longitude"])
        .drop_duplicates(subset=["location"])
        [["location", "latitude", "longitude"]]
        .reset_index(drop=True)
    )
    print(f"  Loaded {len(locations)} unique station locations from: {source}")
    return locations


def fetch_weather_for_location(lat, lon, start_date, end_date):
    """Fetch hourly weather data for a single lat/lon from Open-Meteo."""
    params = {
        "latitude":    round(lat, 4),
        "longitude":   round(lon, 4),
        "start_date":  start_date,
        "end_date":    end_date,
        "hourly":      ",".join(HOURLY_VARS),
        "timezone":    "Asia/Kolkata",
        "windspeed_unit": "kmh",
    }
    try:
        resp = requests.get(BASE_URL, params=params, timeout=30)
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}: {resp.text[:200]}"
        return resp.json(), None
    except requests.exceptions.RequestException as e:
        return None, str(e)


def parse_weather_response(data, location_name, lat, lon):
    """Convert Open-Meteo JSON response into a list of row dicts."""
    hourly = data.get("hourly", {})
    times  = hourly.get("time", [])
    if not times:
        return []

    rows = []
    for i, ts in enumerate(times):
        row = {
            "timestamp":     ts,
            "location":      location_name,
            "latitude":      lat,
            "longitude":     lon,
        }
        for var in HOURLY_VARS:
            vals = hourly.get(var, [])
            row[var] = vals[i] if i < len(vals) else None
        rows.append(row)
    return rows


def load_checkpoint():
    """Load already-fetched locations from checkpoint."""
    if os.path.exists(CHECKPOINT_FILE):
        df = pd.read_csv(CHECKPOINT_FILE)
        done = set(df["location"].unique())
        print(f"[CHECKPOINT] Resuming — {len(done)} locations already fetched, {len(df):,} rows loaded.")
        return df, done
    return pd.DataFrame(), set()


# ============================================================
# Main Pipeline
# ============================================================
def fetch_india_weather():
    print("=" * 60)
    print("  India Weather Ingestion Pipeline (Open-Meteo)")
    print(f"  Variables  : {len(HOURLY_VARS)} hourly variables")
    print(f"  Days back  : {DAYS_BACK}")
    print("=" * 60)

    # Date range
    end_date   = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    start_date = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).strftime("%Y-%m-%d")
    print(f"\n  Date range : {start_date} to {end_date}")

    # Load station locations
    print("\n[1/2] Loading station locations from AQI data...")
    locations = get_station_locations()

    # Load checkpoint
    checkpoint_df, done_locations = load_checkpoint()
    all_rows = checkpoint_df.to_dict("records") if not checkpoint_df.empty else []

    pending = locations[~locations["location"].isin(done_locations)]
    print(f"\n[2/2] Fetching weather for {len(pending)} locations (skipping {len(done_locations)} done)...\n")

    for i, row in enumerate(pending.itertuples(index=False)):
        label = f"[{i+1}/{len(pending)}] {row.location} ({row.latitude:.3f}, {row.longitude:.3f})"
        print(f"  {label}", end="", flush=True)

        data, err = fetch_weather_for_location(row.latitude, row.longitude, start_date, end_date)
        if err:
            print(f" -> [ERROR] {err}")
            time.sleep(REQUEST_DELAY)
            continue

        parsed = parse_weather_response(data, row.location, row.latitude, row.longitude)
        all_rows.extend(parsed)
        print(f" -> {len(parsed)} records")

        # Checkpoint every 50 locations
        if (i + 1) % 50 == 0:
            cp_df = pd.DataFrame(all_rows)
            cp_df.to_csv(CHECKPOINT_FILE, index=False)
            print(f"\n  [CHECKPOINT] Saved {len(cp_df):,} rows after {i+1} locations.\n")

        time.sleep(REQUEST_DELAY)

    # Final DataFrame
    print("\nBuilding final DataFrame...")
    df = pd.DataFrame(all_rows)
    if df.empty:
        print("[WARNING] No weather data collected.")
        return df

    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.sort_values(["location", "timestamp"], inplace=True)
    df.drop_duplicates(subset=["location", "timestamp"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df


# ============================================================
# Entry Point
# ============================================================
if __name__ == "__main__":
    start_time = time.time()
    df_weather = fetch_india_weather()

    print(f"\n{'='*60}")
    print(f"  Weather Extraction Complete!")
    print(f"  Total rows      : {len(df_weather):,}")
    print(f"  Unique stations : {df_weather['location'].nunique() if not df_weather.empty else 0}")
    print(f"  Columns         : {list(df_weather.columns)}")
    print(f"  Time taken      : {(time.time()-start_time)/60:.1f} minutes")
    print(f"{'='*60}")

    if not df_weather.empty:
        print(f"\nSaving to {OUTPUT_FILE}...")
        df_weather.to_csv(OUTPUT_FILE, index=False)
        print("Done!")

        # Clean up checkpoint
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print("[CHECKPOINT] Cleaned up checkpoint file.")
