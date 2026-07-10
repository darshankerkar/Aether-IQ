import osmnx as ox
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
import time
import os
import warnings
warnings.filterwarnings("ignore")

# ============================================================
# Configuration
# ============================================================
OUTPUT_FILE     = "../data/raw/india_land_use.csv"
CHECKPOINT_FILE = "../data/raw/india_land_use_checkpoint.csv"
RADIUS_METERS   = 2000   # Buffer radius around each station

# Source of station locations
AQI_FINAL      = "../data/raw/india_aqi_hourly.csv"
AQI_CHECKPOINT = "../data/raw/india_aqi_checkpoint.csv"

# OSM tags to query
LAND_USE_TAGS = {"landuse": True}
ROAD_TAGS     = {"highway": True}

# Land use categories mapped to simplified labels
LANDUSE_GROUPS = {
    "industrial":    "industrial",
    "commercial":    "commercial",
    "retail":        "commercial",
    "construction":  "construction",
    "residential":   "residential",
    "grass":         "green",
    "forest":        "green",
    "recreation_ground": "green",
    "farmland":      "agricultural",
    "farm":          "agricultural",
    "orchard":       "agricultural",
    "cemetery":      "other",
    "religious":     "other",
    "education":     "institutional",
    "institutional": "institutional",
    "military":      "other",
    "transport":     "transport",
}

# Roads that contribute to traffic pollution
HIGH_TRAFFIC_ROADS = {
    "motorway", "motorway_link", "trunk", "trunk_link",
    "primary", "primary_link", "secondary", "secondary_link"
}
ALL_ROADS = HIGH_TRAFFIC_ROADS | {
    "tertiary", "tertiary_link", "residential", "living_street", "unclassified"
}


# ============================================================
# Helpers
# ============================================================
def get_station_locations():
    """Load unique station lat/lon from AQI data."""
    source = None
    if os.path.exists(AQI_FINAL):
        source = AQI_FINAL
    elif os.path.exists(AQI_CHECKPOINT):
        source = AQI_CHECKPOINT
    else:
        raise FileNotFoundError("No AQI data found. Run ingest_aqi.py first.")

    df = pd.read_csv(source, usecols=["location", "latitude", "longitude"])
    locations = (
        df.dropna(subset=["latitude", "longitude"])
        .drop_duplicates(subset=["location"])
        [["location", "latitude", "longitude"]]
        .reset_index(drop=True)
    )
    print(f"  Loaded {len(locations)} unique station locations from: {source}")
    return locations


def safe_osm_query(func, *args, **kwargs):
    """Run an OSM query with retry on failure."""
    for attempt in range(3):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                return None
    return None


def compute_land_use_features(lat, lon, radius=RADIUS_METERS):
    """
    For a given lat/lon, compute land-use composition and road density
    within `radius` meters using OSM data.
    """
    point = (lat, lon)
    features = {
        "radius_m":             radius,
        # Land use fractions
        "pct_industrial":       0.0,
        "pct_commercial":       0.0,
        "pct_construction":     0.0,
        "pct_residential":      0.0,
        "pct_green":            0.0,
        "pct_agricultural":     0.0,
        "pct_institutional":    0.0,
        "pct_transport":        0.0,
        "pct_other_landuse":    0.0,
        # Road density
        "road_density_all_km_per_km2":       0.0,
        "road_density_major_km_per_km2":     0.0,
        # Counts
        "industrial_count":     0,
        "construction_count":   0,
    }

    try:
        # Create a projected circle buffer for area calculations
        gdf_point = gpd.GeoDataFrame(
            geometry=[Point(lon, lat)], crs="EPSG:4326"
        ).to_crs("EPSG:32643")  # UTM zone 43N (covers most of India)
        buffer = gdf_point.geometry.iloc[0].buffer(radius)
        buffer_area_km2 = buffer.area / 1e6

        # --- Land Use ---
        lu_gdf = safe_osm_query(
            ox.features_from_point, point, tags=LAND_USE_TAGS, dist=radius
        )
        if lu_gdf is not None and not lu_gdf.empty and "landuse" in lu_gdf.columns:
            lu_proj = lu_gdf.to_crs("EPSG:32643")
            lu_proj["area_m2"] = lu_proj.geometry.intersection(buffer).area
            total_lu_area = lu_proj["area_m2"].sum()

            if total_lu_area > 0:
                for raw_cat, group in LANDUSE_GROUPS.items():
                    mask = lu_proj["landuse"] == raw_cat
                    area = lu_proj.loc[mask, "area_m2"].sum()
                    key = f"pct_{group}"
                    if key in features:
                        features[key] += area / total_lu_area

                # Counts of high-concern categories
                features["industrial_count"]   = int((lu_proj["landuse"] == "industrial").sum())
                features["construction_count"] = int((lu_proj["landuse"] == "construction").sum())

        # --- Road Density ---
        graph = safe_osm_query(
            ox.graph_from_point, point, dist=radius, network_type="drive", simplify=True
        )
        if graph is not None:
            edges = ox.graph_to_gdfs(graph, nodes=False)
            edges_proj = edges.to_crs("EPSG:32643")

            # Clip to buffer
            edges_in = edges_proj[edges_proj.geometry.intersects(buffer)]
            if not edges_in.empty:
                all_length_km = edges_in.geometry.length.sum() / 1000
                major = edges_in[
                    edges_in.get("highway", pd.Series(dtype=str))
                    .apply(lambda x: any(r in HIGH_TRAFFIC_ROADS for r in ([x] if isinstance(x, str) else x)))
                ]
                major_length_km = major.geometry.length.sum() / 1000

                features["road_density_all_km_per_km2"]   = round(all_length_km   / buffer_area_km2, 3)
                features["road_density_major_km_per_km2"] = round(major_length_km / buffer_area_km2, 3)

    except Exception as e:
        pass  # Return zeros on any error

    return features


def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        df = pd.read_csv(CHECKPOINT_FILE)
        done = set(df["location"].unique())
        print(f"[CHECKPOINT] Resuming — {len(done)} locations done, {len(df)} rows loaded.")
        return df, done
    return pd.DataFrame(), set()


# ============================================================
# Main Pipeline
# ============================================================
def fetch_india_land_use():
    print("=" * 60)
    print("  India Land Use & Road Density Pipeline (OSMnx)")
    print(f"  Buffer radius : {RADIUS_METERS}m around each station")
    print("=" * 60)

    print("\n[1/2] Loading station locations from AQI data...")
    locations = get_station_locations()

    checkpoint_df, done_locations = load_checkpoint()
    all_rows = checkpoint_df.to_dict("records") if not checkpoint_df.empty else []

    pending = locations[~locations["location"].isin(done_locations)]
    print(f"\n[2/2] Computing land-use features for {len(pending)} locations "
          f"(skipping {len(done_locations)} done)...\n")

    for i, row in enumerate(pending.itertuples(index=False)):
        label = f"[{i+1}/{len(pending)}] {row.location}"
        print(f"  {label}", end="", flush=True)

        t0 = time.time()
        feats = compute_land_use_features(row.latitude, row.longitude)
        elapsed = time.time() - t0

        all_rows.append({
            "location":  row.location,
            "latitude":  row.latitude,
            "longitude": row.longitude,
            **feats
        })
        print(f" -> done ({elapsed:.1f}s)")

        # Checkpoint every 20 locations (OSM is slower)
        if (i + 1) % 20 == 0:
            cp_df = pd.DataFrame(all_rows)
            cp_df.to_csv(CHECKPOINT_FILE, index=False)
            print(f"\n  [CHECKPOINT] Saved {len(cp_df)} rows after {i+1} locations.\n")

        time.sleep(1.0)  # Be polite to OSM Nominatim/Overpass

    # Final DataFrame
    print("\nBuilding final DataFrame...")
    df = pd.DataFrame(all_rows)
    if df.empty:
        print("[WARNING] No land use data collected.")
        return df

    df.drop_duplicates(subset=["location"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ============================================================
# Entry Point
# ============================================================
if __name__ == "__main__":
    start_time = time.time()
    df_lu = fetch_india_land_use()

    print(f"\n{'='*60}")
    print(f"  Land Use Extraction Complete!")
    print(f"  Total stations : {len(df_lu)}")
    print(f"  Columns        : {list(df_lu.columns)}")
    print(f"  Time taken     : {(time.time()-start_time)/60:.1f} minutes")
    print(f"{'='*60}")

    if not df_lu.empty:
        print("\nSample output:")
        print(df_lu[["location", "pct_industrial", "pct_residential",
                      "road_density_all_km_per_km2"]].head(10).to_string())

        print(f"\nSaving to {OUTPUT_FILE}...")
        df_lu.to_csv(OUTPUT_FILE, index=False)
        print("Done!")

        if os.path.exists(CHECKPOINT_FILE):
            os.remove(CHECKPOINT_FILE)
            print("[CHECKPOINT] Cleaned up checkpoint file.")
