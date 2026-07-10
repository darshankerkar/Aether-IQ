import requests
import pandas as pd
from datetime import datetime, timedelta, timezone
import time
import os

# ============================================================
# Configuration
# ============================================================
API_KEY  = "7739f9407c393a6add4bc89f3e04481c3921ce0b3987d1f86b80a4f9e3b4da9f"
HEADERS  = {"X-API-Key": API_KEY}
BASE_URL = "https://api.openaq.org/v3"

COUNTRY_ID     = 9           # India's country ID in OpenAQ
DAYS_BACK      = 30          # Days of historical data
PAGE_LIMIT     = 1000        # Max records per API page
REQUEST_DELAY  = 0.25        # Seconds between requests (rate limiting)
CHECKPOINT_EVERY = 50        # Save progress every N sensors
OUTPUT_FILE     = "../data/raw/india_aqi_hourly.csv"
CHECKPOINT_FILE = "../data/raw/india_aqi_checkpoint.csv"

# All target pollutants
TARGET_PARAMS = {"pm25", "pm10", "no2", "so2", "co", "o3"}


# ============================================================
# Helpers
# ============================================================
def paginated_get(url, params, headers, desc=""):
    """Fetch all pages from a paginated OpenAQ v3 endpoint."""
    all_results = []
    page = 1
    while True:
        params["page"] = page
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        except requests.exceptions.RequestException as e:
            print(f"  [WARN] Request error on page {page}: {e}")
            break

        if resp.status_code == 429:
            print("  [RATE LIMIT] Sleeping 10s...")
            time.sleep(10)
            continue
        if resp.status_code != 200:
            print(f"  [WARN] HTTP {resp.status_code} {desc} page {page}: {resp.text[:200]}")
            break

        data = resp.json()
        if not isinstance(data, dict):
            break

        results = data.get("results", [])
        all_results.extend(results)

        # Stop if last page
        if len(results) < params.get("limit", PAGE_LIMIT):
            break
        page += 1
        time.sleep(REQUEST_DELAY)

    return all_results


def load_checkpoint():
    """Load already-fetched sensor IDs from checkpoint file."""
    if os.path.exists(CHECKPOINT_FILE):
        df = pd.read_csv(CHECKPOINT_FILE)
        done_ids = set(df["sensor_id"].unique())
        print(f"[CHECKPOINT] Resuming — {len(done_ids)} sensors already fetched, {len(df)} rows loaded.")
        return df, done_ids
    return pd.DataFrame(), set()


def save_checkpoint(df):
    df.to_csv(CHECKPOINT_FILE, index=False)


# ============================================================
# Main Pipeline
# ============================================================
def fetch_india_aqi():
    print("=" * 60)
    print("  India AQI Ingestion Pipeline")
    print(f"  Pollutants : {', '.join(sorted(TARGET_PARAMS))}")
    print(f"  Days back  : {DAYS_BACK}")
    print("=" * 60)

    # --- PART A: Get ALL India Locations (paginated) ---
    print("\n[1/3] Fetching all India monitoring locations...")
    loc_params = {
        "countries_id": COUNTRY_ID,
        "limit": 1000
    }
    locations = paginated_get(f"{BASE_URL}/locations", loc_params, HEADERS, "locations")
    print(f"      Found {len(locations)} locations across India.")

    if not locations:
        print("[ERROR] No locations returned. Check API key or country ID.")
        return pd.DataFrame()

    # --- PART B: Extract sensor metadata for all target pollutants ---
    print("\n[2/3] Extracting sensor metadata...")
    sensor_metadata = []
    for loc in locations:
        for sensor in loc.get("sensors", []):
            param_name = sensor.get("parameter", {}).get("name", "")
            if param_name in TARGET_PARAMS:
                sensor_metadata.append({
                    "location_name": loc.get("name"),
                    "location_id":   loc.get("id"),
                    "sensor_id":     sensor.get("id"),
                    "parameter":     param_name,
                    "unit":          sensor.get("parameter", {}).get("units"),
                    "city":          loc.get("locality") or loc.get("name", "").split(",")[-1].strip(),
                    "state":         loc.get("name", ""),
                    "latitude":      loc.get("coordinates", {}).get("latitude"),
                    "longitude":     loc.get("coordinates", {}).get("longitude"),
                    "provider":      loc.get("provider", {}).get("name"),
                })

    print(f"      Found {len(sensor_metadata)} sensors for target pollutants.")
    for p in sorted(TARGET_PARAMS):
        count = sum(1 for s in sensor_metadata if s["parameter"] == p)
        print(f"        {p:>6}: {count} sensors")

    # --- PART C: Fetch Hourly Measurements (with checkpointing) ---
    print(f"\n[3/3] Fetching {DAYS_BACK} days of measurements...")
    date_from = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).strftime('%Y-%m-%dT%H:%M:%SZ')
    date_to   = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    checkpoint_df, done_sensor_ids = load_checkpoint()
    all_measurements = checkpoint_df.to_dict("records") if not checkpoint_df.empty else []

    pending = [s for s in sensor_metadata if s["sensor_id"] not in done_sensor_ids]
    print(f"      {len(pending)} sensors to fetch (skipping {len(done_sensor_ids)} already done).\n")

    for i, meta in enumerate(pending):
        sensor_id = meta["sensor_id"]
        label = f"[{i+1}/{len(pending)}] Sensor {sensor_id} ({meta['parameter']}) @ {meta['location_name']}"
        print(f"  {label}", end="", flush=True)

        meas_params = {
            "datetime_from": date_from,
            "datetime_to":   date_to,
            "limit":         PAGE_LIMIT
        }
        records = paginated_get(
            f"{BASE_URL}/sensors/{sensor_id}/hours",
            meas_params, HEADERS,
            desc=label
        )
        print(f" -> {len(records)} records")

        for r in records:
            all_measurements.append({
                "timestamp":     r.get("period", {}).get("datetimeTo", {}).get("utc"),
                "location":      meta["location_name"],
                "location_id":   meta["location_id"],
                "sensor_id":     sensor_id,
                "parameter":     meta["parameter"],
                "value":         r.get("value"),
                "unit":          meta["unit"],
                "latitude":      meta["latitude"],
                "longitude":     meta["longitude"],
                "city":          meta["city"],
                "provider":      meta["provider"],
            })

        # Checkpoint every N sensors
        if (i + 1) % CHECKPOINT_EVERY == 0:
            cp_df = pd.DataFrame(all_measurements)
            save_checkpoint(cp_df)
            print(f"\n  [CHECKPOINT] Saved {len(cp_df)} rows after {i+1} sensors.\n")

        time.sleep(REQUEST_DELAY)

    # --- PART D: Final DataFrame ---
    print("\nBuilding final DataFrame...")
    df = pd.DataFrame(all_measurements)
    if df.empty:
        print("[WARNING] No measurements collected.")
        return df

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df.sort_values(["parameter", "location", "timestamp"], inplace=True)
    df.drop_duplicates(subset=["sensor_id", "timestamp"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df


# ============================================================
# Entry Point
# ============================================================
if __name__ == "__main__":
    start = time.time()
    df_aqi = fetch_india_aqi()

    print(f"\n{'='*60}")
    print(f"  Extraction Complete!")
    print(f"  Total rows     : {len(df_aqi):,}")
    print(f"  Unique stations: {df_aqi['location'].nunique() if not df_aqi.empty else 0}")
    print(f"  Date range     : {df_aqi['timestamp'].min()} -> {df_aqi['timestamp'].max()}" if not df_aqi.empty else "")
    print(f"  Time taken     : {(time.time()-start)/60:.1f} minutes")
    print(f"{'='*60}")

    if not df_aqi.empty:
        print("\nPollutant breakdown:")
        print(df_aqi.groupby("parameter")["value"].agg(["count", "mean", "min", "max"]).round(2).to_string())

        print(f"\nSaving to {OUTPUT_FILE}...")
        df_aqi.to_csv(OUTPUT_FILE, index=False)
        print("Done!")

        # Clean up checkpoint after successful run
        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print("[CHECKPOINT] Cleaned up checkpoint file.")