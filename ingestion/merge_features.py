import pandas as pd
import os

# ============================================================
# Configuration
# ============================================================
AQI_FILE      = "../data/raw/india_aqi_hourly.csv"
WEATHER_FILE  = "../data/raw/india_weather_hourly.csv"
LAND_USE_FILE = "../data/raw/india_land_use.csv"
OUTPUT_FILE   = "../data/processed/india_master_features.csv"


# ============================================================
# Helpers
# ============================================================
def check_files():
    missing = []
    for f in [AQI_FILE, WEATHER_FILE]:  # Land use is optional
        if not os.path.exists(f):
            missing.append(f)
    if missing:
        print("[ERROR] Missing required files:")
        for f in missing:
            print(f"  - {f}")
        return False
    if not os.path.exists(LAND_USE_FILE):
        print(f"[WARN] {LAND_USE_FILE} not found — skipping land use features.")
    return True


def load_aqi():
    print("[1/4] Loading AQI data...")
    df = pd.read_csv(AQI_FILE, parse_dates=["timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    # Round timestamp to nearest hour for clean joins
    df["timestamp_hour"] = df["timestamp"].dt.floor("h")
    print(f"      {len(df):,} rows | {df['location'].nunique()} stations | "
          f"params: {sorted(df['parameter'].unique())}")
    return df


def load_weather():
    print("[2/4] Loading Weather data...")
    df = pd.read_csv(WEATHER_FILE, parse_dates=["timestamp"])
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    # Localize to UTC if not already
    if df["timestamp"].dt.tz is None:
        df["timestamp"] = df["timestamp"].dt.tz_localize("Asia/Kolkata").dt.tz_convert("UTC")
    df["timestamp_hour"] = df["timestamp"].dt.floor("h")
    # Rename columns to avoid clashes
    weather_cols = [c for c in df.columns if c not in ["timestamp", "timestamp_hour", "location", "latitude", "longitude"]]
    df = df.rename(columns={c: f"wx_{c}" for c in weather_cols})
    print(f"      {len(df):,} rows | {df['location'].nunique()} stations | "
          f"{len(weather_cols)} weather variables")
    return df


def load_land_use():
    print("[3/4] Loading Land Use data...")
    df = pd.read_csv(LAND_USE_FILE)
    lu_cols = [c for c in df.columns if c not in ["location", "latitude", "longitude"]]
    print(f"      {len(df)} stations | {len(lu_cols)} land-use features")
    return df


# ============================================================
# Main Merge Pipeline
# ============================================================
def merge_all():
    print("=" * 60)
    print("  India Master Feature Merge Pipeline")
    print("=" * 60)

    if not check_files():
        return

    # Load all datasets
    df_aqi     = load_aqi()
    df_weather = load_weather()
    df_land    = load_land_use() if os.path.exists(LAND_USE_FILE) else None

    # ---- Step 1: Pivot AQI so each pollutant is its own column ----
    print("\n[4/4] Merging datasets...")
    print("  Pivoting AQI pollutants to wide format...")
    df_aqi_wide = df_aqi.pivot_table(
        index=["timestamp_hour", "location", "latitude", "longitude", "location_id"],
        columns="parameter",
        values="value",
        aggfunc="mean"
    ).reset_index()
    df_aqi_wide.columns.name = None
    # Rename pollutant columns with prefix
    poll_cols = [c for c in df_aqi_wide.columns if c in ["pm25", "pm10", "no2", "so2", "co", "o3"]]
    df_aqi_wide = df_aqi_wide.rename(columns={c: f"aqi_{c}" for c in poll_cols})
    print(f"  AQI wide: {len(df_aqi_wide):,} rows x {len(df_aqi_wide.columns)} cols")

    # ---- Step 2: Merge Weather (left join on location + timestamp) ----
    print("  Merging weather...")
    df_weather_slim = df_weather.drop(columns=["timestamp", "latitude", "longitude"], errors="ignore")
    df_merged = df_aqi_wide.merge(
        df_weather_slim,
        on=["timestamp_hour", "location"],
        how="left"
    )
    print(f"  After weather merge: {len(df_merged):,} rows x {len(df_merged.columns)} cols")

    # ---- Step 3: Merge Land Use (optional) ----
    if df_land is not None:
        print("  Merging land use...")
        df_land_slim = df_land.drop(columns=["latitude", "longitude"], errors="ignore")
        df_merged = df_merged.merge(
            df_land_slim,
            on="location",
            how="left"
        )
        print(f"  After land-use merge: {len(df_merged):,} rows x {len(df_merged.columns)} cols")
    else:
        print("  Skipping land use (file not available).")

    # ---- Step 4: Add derived time features ----
    print("  Adding time features...")
    df_merged["hour_of_day"]    = df_merged["timestamp_hour"].dt.hour
    df_merged["day_of_week"]    = df_merged["timestamp_hour"].dt.dayofweek  # 0=Mon
    df_merged["is_weekend"]     = df_merged["day_of_week"].isin([5, 6]).astype(int)
    df_merged["month"]          = df_merged["timestamp_hour"].dt.month
    df_merged["date"]           = df_merged["timestamp_hour"].dt.date.astype(str)

    # ---- Step 5: Clean up ----
    df_merged = df_merged.rename(columns={"timestamp_hour": "timestamp"})
    df_merged.sort_values(["location", "timestamp"], inplace=True)
    df_merged.reset_index(drop=True, inplace=True)

    return df_merged


# ============================================================
# Entry Point
# ============================================================
if __name__ == "__main__":
    df = merge_all()

    if df is not None and not df.empty:
        print(f"\n{'='*60}")
        print(f"  Master Dataset Ready!")
        print(f"  Shape          : {df.shape[0]:,} rows x {df.shape[1]} columns")
        print(f"  Unique stations: {df['location'].nunique()}")
        print(f"  Date range     : {df['timestamp'].min()} to {df['timestamp'].max()}")
        print(f"{'='*60}")

        print("\nColumn overview:")
        for col in df.columns:
            non_null = df[col].notna().sum()
            print(f"  {col:<45} {non_null:>8,} non-null ({non_null/len(df)*100:.1f}%)")

        print(f"\nSaving to {OUTPUT_FILE}...")
        df.to_csv(OUTPUT_FILE, index=False)
        print("Done! Master dataset saved.")

        print("\nSample rows:")
        print(df.head(3).to_string())
