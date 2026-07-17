# BUGS.md — AQI Intelligence Platform
> Complete bug registry for the ET AI Hackathon project.
> Last audited: 2026-07-15 | Layers covered: Django backend · FastAPI AI service · React frontend

---

## Severity Legend

| Symbol | Level | Meaning |
|--------|-------|---------|
| 🔴 | **Critical** | Will crash in production / silently returns wrong data |
| 🟠 | **High** | Significant correctness or reliability issue |
| 🟡 | **Medium** | Suboptimal behaviour, data quality degraded |
| 🟢 | **Low** | Minor issue, code quality or clarity only |

---

## LAYER 1 — FastAPI AI Service (`platform/ai_service/`)

---

### BUG-01 🔴 Forecasting model predicts PM2.5 concentration, NOT AQI — unit mismatch propagates everywhere

**File:** `agents/forecasting.py` — Lines 70–72, 148–150

**Root Cause:**
The multi-output regressor is trained with `target_6h`, `target_24h`, `target_72h` set to **shifted `aqi_pm25` column values** — which is raw PM2.5 concentration in µg/m³. The output is then passed through `_pm25_to_aqi()` to convert to AQI scale. However, the conversion only approximates the true CPCB AQI (which is the **maximum** sub-index across all pollutants, not just PM2.5). This means:

1. If NO2 or PM10 is the dominant pollutant, the forecast AQI is systematically underestimated.
2. The column is named `aqi_pm25` suggesting it may already be a sub-index, but the conversion function treats it as raw µg/m³ — **double-conversion risk**.

**Broken Code:**
```python
# forecasting.py line 71 — targets raw pm25 concentration
grp[f'target_{key}'] = grp['aqi_pm25'].shift(-shift)

# forecasting.py line 150 — converts as if raw ug/m3
aqi_pred = self._pm25_to_aqi(aqi_pred)
```

**Fix:**
```python
# Compute true composite AQI and use that as target
# Add to _load_data():
def india_composite_aqi(row):
    subs = []
    pm25 = row.get('aqi_pm25', 0) or 0
    pm10 = row.get('aqi_pm10', 0) or 0
    if pm25 > 0: subs.append(pm25_to_aqi(pm25))
    if pm10 > 0: subs.append(pm10_to_aqi(pm10))
    return max(subs) if subs else None

df['composite_aqi'] = df.apply(india_composite_aqi, axis=1)

# Then use composite_aqi as target, skip _pm25_to_aqi() on predict output:
grp[f'target_{key}'] = grp['composite_aqi'].shift(-shift)
```

---

### BUG-02 🔴 `_build_synthetic_model()` never sets `self.df` — `predict()` always falls back to random numbers

**File:** `agents/forecasting.py` — Lines 110–118, 122–123

**Root Cause:**
When the CSV is missing, `_build_synthetic_model()` trains a model on random data but **never sets `self.df`**. The `predict()` method checks:

```python
if self.model is None or self.df is None:
    return self._synthetic_forecast(station_name)
```

So even with a trained synthetic model, `self.df is None` is always `True` — every prediction hits `_synthetic_forecast()` which uses `random.randint`. The synthetic model trained in `_build_synthetic_model()` is completely wasted.

**Fix:**
```python
def _build_synthetic_model(self):
    """Fallback model if CSV not available."""
    X = np.random.rand(5000, len(FEATURE_COLS)) * 200
    Y = X[:, 0:3] + np.random.randn(5000, 3) * 10
    model = Pipeline([...])
    model.fit(X, Y)
    self.model = model
    self.available_feats = FEATURE_COLS
    # FIX: create a minimal synthetic df so predict() doesn't short-circuit
    self.df = pd.DataFrame(columns=['location'] + FEATURE_COLS)
```

Or alternatively, fix the guard in `predict()`:
```python
# Remove the `or self.df is None` check; handle empty grp below
if self.model is None:
    return self._synthetic_forecast(station_name)
```

---

### BUG-03 🔴 Attribution is 100% rule-based — no ML, no SHAP — will fail judge evaluation

**File:** `agents/attribution.py` — Lines 49–131

**Root Cause:**
`_compute_attribution()` uses hard-coded if/else thresholds (e.g. `if no2 > 30: traffic += 20`). There is no trained model, no SHAP values, no feature importance. The hackathon PS explicitly evaluates "attribution accuracy vs. ground-truth emission inventories" — this rule-based approach is not defensible.

**Concrete symptoms:**
- All stations with the same NO2/SO2 level get identical attribution regardless of spatial context
- Weekend flag just subtracts traffic linearly, ignoring complex interactions
- `train()` method does nothing ML-related — just caches rule outputs

**Fix (hackathon-viable, ~2 hrs):**
```python
# In train(), after loading df:
from sklearn.ensemble import GradientBoostingRegressor
import shap

features = ['aqi_pm25','aqi_pm10','aqi_no2','aqi_so2','aqi_co',
            'wx_windspeed_10m','wx_boundary_layer_height',
            'wx_precipitation','hour_of_day','is_weekend']

X = df[features].fillna(0).values
y = df['aqi_pm25'].fillna(0).values  # or composite AQI

self.gbm = GradientBoostingRegressor(n_estimators=100, max_depth=4)
self.gbm.fit(X, y)
self.explainer = shap.TreeExplainer(self.gbm)

# Map feature groups -> source categories for attribution output
FEATURE_TO_SOURCE = {
    'aqi_no2': 'traffic', 'aqi_co': 'traffic',
    'wx_windspeed_10m': 'natural', 'wx_boundary_layer_height': 'natural',
    'aqi_so2': 'industrial', 'aqi_pm10': 'construction',
}
```

---

### BUG-04 🟠 No persistence-baseline RMSE comparison — judges will flag this

**File:** `agents/forecasting.py` — Lines 96–108

**Root Cause:**
The forecast response includes RMSE against test split, but NO comparison to the persistence baseline (`AQI(t+N) = AQI(t)`). The hackathon PS explicitly says: "Forecast RMSE vs. a persistence baseline." Without this, the model accuracy claim is unverifiable.

**Fix — add to `train()`:**
```python
# After computing self.rmse, add persistence baseline
for i, key in enumerate(TARGET_SHIFT.keys()):
    persistence_rmse = np.sqrt(mean_squared_error(Y_te[:, i], X_te[:, 0]))
    self.rmse[f'{key}_persistence_baseline'] = round(persistence_rmse, 2)
    self.rmse[f'{key}_skill_score'] = round(
        1 - (self.rmse[key] / persistence_rmse), 3
    )  # positive = better than persistence
```

Return this in the `/forecast` response so judges can see the improvement over baseline.

---

### BUG-05 🟠 `_synthetic_forecast()` uses `random.randint` with no seed — every call returns different numbers

**File:** `agents/forecasting.py` — Lines 195–211

**Root Cause:**
```python
base = random.randint(80, 280)
```
No seed is set. Every API call to `/forecast/{station}` returns a different AQI value, making the dashboard flicker and making any "comparison" between attribution and forecast meaningless in a demo.

**Fix:**
```python
import hashlib

def _synthetic_forecast(self, station_name: str) -> dict:
    # Deterministic seed from station name — same station always returns same values
    seed = int(hashlib.md5(station_name.encode()).hexdigest()[:8], 16) % 10000
    rng = random.Random(seed)
    base = rng.randint(80, 280)
    ...
```

---

### BUG-06 🟠 `RecommendationAgent` priority boost tautology — `priority` always set to `'high'`

**File:** `agents/recommendation.py` — Lines 76–78

**Root Cause:**
```python
if source in dominant:
    priority = 'high' if priority != 'high' else 'high'  # both branches identical!
```
The ternary is `A if condition else A` — identical value on both sides. The else branch should preserve original priority but instead also sets `'high'`.

**Fix:**
```python
if source in dominant:
    priority = 'high' if priority == 'medium' else priority  # escalate medium only
    conf = min(0.99, conf + 0.05)
```

---


---

### BUG-08 🟡 NLG Agent generates English-only output — PS requires multilingual (at minimum Hindi)

**File:** `agents/nlg.py` — Lines 63–74

**Root Cause:**
`NLGAgent.explain()` returns only English fields. The PS explicitly states "multilingual" and "citizen health advisory in local language." The Django `CitizenAlert` model stores `message_hi` but the NLG agent never generates it.

**Fix (no LLM required):**
```python
HINDI_CATEGORY = {
    "Good": "अच्छी", "Satisfactory": "संतोषजनक",
    "Moderate": "मध्यम", "Poor": "खराब",
    "Very Poor": "बहुत खराब", "Severe": "गंभीर"
}

# In explain(), add to return dict:
'summary_hi': f"{station_name} पर वायु गुणवत्ता {HINDI_CATEGORY.get(category, category)} है (AQI {aqi:.0f}).",
'health_advisory_hi': self._health_advisory_hi(aqi),
```

---

### BUG-09 🟡 FastAPI CORS wildcard `allow_origins=["*"]` — will break with any auth header added later

**File:** `main.py` — Lines 66–71

**Fix:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

## LAYER 2 — Django REST Backend (`platform/backend/`)

---

### BUG-10 🔴 `live_overview` — N+1 query problem: 1 DB query per station for latest reading

**File:** `aqi/views.py` — Lines 58–86

**Root Cause:**
```python
stations = AQIStation.objects.filter(is_active=True).prefetch_related('readings')
for s in stations:
    latest = s.readings.order_by('-timestamp').first()  # NEW query per station!
```
`prefetch_related('readings')` fetches ALL readings for ALL stations (potentially millions of rows), then `order_by('-timestamp').first()` inside the loop is still a new DB query per station despite the prefetch.

**Fix (use `Subquery`):**
```python
from django.db.models import OuterRef, Subquery

latest_qs = AQIReading.objects.filter(
    station=OuterRef('pk')
).order_by('-timestamp')

stations = AQIStation.objects.filter(is_active=True).select_related('city').annotate(
    latest_aqi=Subquery(latest_qs.values('aqi_value')[:1]),
    latest_ts=Subquery(latest_qs.values('timestamp')[:1]),
    latest_pm25=Subquery(latest_qs.values('pm25')[:1]),
    latest_category=Subquery(latest_qs.values('aqi_category')[:1]),
)
# Single query for all stations + their latest reading
```

---

### BUG-11 🔴 `load_data.py` — entire `existing` readings set loaded into RAM before insert

**File:** `aqi/management/commands/load_data.py` — Lines 141–143

**Root Cause:**
```python
existing = set(
    AQIReading.objects.values_list('station_id', 'timestamp')
)
```
With 500K existing readings, this loads 500K `(int, datetime)` tuples into a Python `set` in RAM. Will OOM on machines with limited memory for large datasets.

**Fix:**
```python
from django.db.models import Max

# Load only per-station max timestamp
station_max_ts = dict(
    AQIReading.objects.values('station_id')
    .annotate(max_ts=Max('timestamp'))
    .values_list('station_id', 'max_ts')
)

# Then in the loop:
if ts <= station_max_ts.get(station.id, datetime.min.replace(tzinfo=timezone.utc)):
    skipped += 1
    continue
```

---

### BUG-12 🟠 `load_data.py` — city name parsed incorrectly from location string

**File:** `aqi/management/commands/load_data.py` — Lines 88–96

**Root Cause:**
```python
parts = loc_name.split('-')
city_part = parts[0].strip()   # "Sector 62, Noida" not "Noida"
```
For station name `"Sector 62, Noida - UPPCB"`, this creates a city called `"Sector 62, Noida"` instead of `"Noida"`. Every station gets its own city record — city-level aggregation is broken.

**Fix:**
```python
# Use last comma-separated token before the dash as city
city_part = loc_name.split('-')[0].split(',')[-1].strip()
# "Sector 62, Noida - UPPCB" -> "Noida"
```

---

### BUG-13 🟠 Django Admin `AQIReadingAdmin` — no pagination/date hierarchy — will time out on large datasets

**File:** `aqi/admin.py` — Lines 18–23

**Fix:**
```python
@admin.register(AQIReading)
class AQIReadingAdmin(admin.ModelAdmin):
    list_display = ['station', 'timestamp', 'aqi_value', 'aqi_category', 'pm25', 'pm10', 'no2']
    list_filter  = ['aqi_category', 'station__city']
    ordering     = ['-timestamp']
    list_per_page = 50           # add this
    date_hierarchy = 'timestamp'  # add this
    raw_id_fields = ['station']   # prevents full station dropdown
```

---

### BUG-14 🟠 `SECRET_KEY` and `OPENAQ_API_KEY` hardcoded in `settings.py` and committed to git

**File:** `backend/backend/settings.py` — Lines 10, 123

**Fix:**
```python
import os
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'dev-insecure-fallback-only')
OPENAQ_API_KEY = os.environ.get('OPENAQ_API_KEY', '')
```
Add `.env` to `.gitignore` and use `python-dotenv` to load env vars.

---

### BUG-15 🟡 `pollutant_trends` — groups readings in Python, not the database — memory-heavy

**File:** `aqi/views.py` — Lines 165–191

**Root Cause:**
Loads all AQIReading rows into Python `defaultdict` then aggregates manually. For 24 hours across 900 stations = 21,600+ rows fetched into memory.

**Fix:**
```python
from django.db.models.functions import TruncHour

result = (
    AQIReading.objects
    .filter(timestamp__gte=cutoff, aqi_value__isnull=False)
    .annotate(hour=TruncHour('timestamp'))
    .values('hour')
    .annotate(pm25=Avg('pm25'), pm10=Avg('pm10'),
              no2=Avg('no2'), aqi=Avg('aqi_value'))
    .order_by('hour')
)
```

---

### BUG-16 🟡 `AQIStation.latest_reading` property hits DB on every property access — no caching

**File:** `aqi/models.py` — Lines 49–51

**Fix:**
```python
from django.utils.functional import cached_property

@cached_property     # replaces @property
def latest_reading(self):
    return self.readings.order_by('-timestamp').first()
```

---

### BUG-17 🟡 `AQIStationListSerializer` issues 4 separate DB queries per station for the same row

**File:** `aqi/serializers.py` — Lines 45–59

**Root Cause:**
`get_latest_aqi`, `get_latest_pm25`, `get_latest_ts`, `get_aqi_category` each call `obj.readings.order_by('-timestamp').first()` independently. For a list of 100 stations = 400 extra queries.

**Fix:**
```python
def _get_latest(self, obj):
    if not hasattr(obj, '_latest_cached'):
        obj._latest_cached = obj.readings.order_by('-timestamp').first()
    return obj._latest_cached

def get_latest_aqi(self, obj):
    r = self._get_latest(obj)
    return round(r.aqi_value, 1) if r and r.aqi_value else None

# Repeat for all 4 methods using _get_latest()
```

---

## LAYER 3 — React Frontend (`platform/frontend/`)

---

### BUG-18 🟠 `Forecast.jsx` — errors silently swallowed — user sees frozen state when AI service is down

**File:** `pages/Forecast.jsx` — Lines 28–36

**Root Cause:**
```jsx
try {
  const [rd, fc] = await Promise.all([...]);
  ...
} catch {}  // empty catch
```
If the FastAPI AI service is down (very likely on first setup), `catch {}` runs silently. `forecast` stays `null`, `loading` becomes `false`, and the user sees a blank panel with no error message.

**Fix:**
```jsx
const [error, setError] = useState(null);

try {
  const [rd, fc] = await Promise.all([...]);
  setReadings(rd.data || []);
  setForecast(fc.data);
} catch (err) {
  setError(`AI service unavailable: ${err.message}`);
} finally {
  setLoading(false);
}

// In JSX:
{error && (
  <div style={{ color: '#EF4444', padding: 16, background: 'rgba(239,68,68,0.1)',
                borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)' }}>
    {error}
  </div>
)}
```

---

### BUG-19 🟠 `Forecast.jsx` passes `s.station_id` (OpenAQ string) to `api.readings()` which expects Django PK

**File:** `pages/Forecast.jsx` — Line 30; `services/api.js` — Line 21

**Root Cause:**
```js
api.readings(s.station_id, 72)   // station_id = OpenAQ string like "1234"
// but endpoint is /stations/{django_pk}/readings/ which needs integer PK
```
The `/api/live/` view returns `station_id` = Django PK (integer), but the field is confusingly named. Passing the OpenAQ string ID causes 404.

**Fix:**
```js
// In Forecast.jsx, use s.station_id which from live_overview view is actually the Django PK
// Verify by checking views.py line 66: 'station_id': s.id  ← this is Django PK
// The field name is misleading. Either rename in view OR clarify in frontend:
api.readings(s.station_id, 72)  // works IF station_id in live response = s.id (Django PK)
```
In `views.py`, rename the field for clarity:
```python
'station_db_id': s.id,
'station_openaq_id': s.station_id,
```

---

### BUG-20 🟡 `aqiBadgeClass()` — `replace(' ', '-')` only replaces first space

**File:** `services/api.js` — Line 61

**Root Cause:**
```js
return cat.toLowerCase().replace(' ', '-');
// "Very Poor" -> "very-poor" (works by luck, only one space)
// If a new category has multiple spaces, CSS class will be malformed
```

**Fix:**
```js
return cat.toLowerCase().replace(/\s+/g, '-');
```

---

### BUG-21 🟡 `Forecast.jsx` — `selectStation` in `useEffect` missing from dependency array — stale closure risk

**File:** `pages/Forecast.jsx` — Lines 15–21

**Fix:**
```jsx
import { useState, useEffect, useCallback } from 'react';

const selectStation = useCallback(async (s) => {
  setSelected(s);
  // ... rest of logic
}, []);

useEffect(() => {
  api.live().then(r => {
    const stns = r.data.stations || [];
    setStations(stns);
    if (stns.length > 0) selectStation(stns[0]);
  });
}, [selectStation]);  // now correctly declared in deps
```

---

### BUG-22 🟢 Base URLs hardcoded to `localhost` in `api.js` — breaks in any deployed environment

**File:** `services/api.js` — Lines 4, 9

**Fix:**
```js
const DJANGO_URL = import.meta.env.VITE_DJANGO_URL || 'http://localhost:8000/api';
const AI_URL     = import.meta.env.VITE_AI_URL     || 'http://localhost:8001';

const DJANGO = axios.create({ baseURL: DJANGO_URL, timeout: 15000 });
const AI     = axios.create({ baseURL: AI_URL,     timeout: 30000 });
```
Create `.env.local` (gitignored):
```
VITE_DJANGO_URL=http://localhost:8000/api
VITE_AI_URL=http://localhost:8001
```

---

## Summary Table

| Bug ID | Severity | Layer | Component | Issue |
|--------|----------|-------|-----------|-------|
| BUG-01 | 🔴 Critical | AI Service | forecasting.py | PM2.5 unit vs AQI unit mismatch |
| BUG-02 | 🔴 Critical | AI Service | forecasting.py | Synthetic model bypassed by `self.df is None` |
| BUG-03 | 🔴 Critical | AI Service | attribution.py | Attribution is pure rules, no ML/SHAP |
| BUG-04 | 🟠 High | AI Service | forecasting.py | No persistence baseline RMSE |
| BUG-05 | 🟠 High | AI Service | forecasting.py | Unseeded `random.randint` in synthetic forecast |
| BUG-06 | 🟠 High | AI Service | recommendation.py | Priority boost tautology — always `'high'` |
| BUG-07 | 🟡 Medium | AI Service | attribution.py | Fuzzy match fails for names without hyphens |
| BUG-08 | 🟡 Medium | AI Service | nlg.py | English-only NLG, no Hindi |
| BUG-09 | 🟡 Medium | AI Service | main.py | CORS wildcard — fragile for future auth |
| BUG-10 | 🔴 Critical | Django | views.py | N+1 query in `live_overview` |
| BUG-11 | 🔴 Critical | Django | load_data.py | Full readings set loaded into RAM |
| BUG-12 | 🟠 High | Django | load_data.py | City name parsed incorrectly |
| BUG-13 | 🟠 High | Django | admin.py | Admin list view will time out at scale |
| BUG-14 | 🟠 High | Django | settings.py | `SECRET_KEY` and API key hardcoded in source |
| BUG-15 | 🟡 Medium | Django | views.py | `pollutant_trends` groups in Python, not DB |
| BUG-16 | 🟡 Medium | Django | models.py | `latest_reading` property uncached |
| BUG-17 | 🟡 Medium | Django | serializers.py | 4x duplicate DB query per station |
| BUG-18 | 🟠 High | Frontend | Forecast.jsx | Errors silently swallowed, no user feedback |
| BUG-19 | 🟠 High | Frontend | Forecast.jsx | `station_id` vs Django PK mismatch |
| BUG-20 | 🟡 Medium | Frontend | api.js | `replace()` misses multi-space category names |
| BUG-21 | 🟡 Medium | Frontend | Forecast.jsx | Stale closure risk in `useEffect` |
| BUG-22 | 🟢 Low | Frontend | api.js | Hardcoded `localhost` URLs |

---

## Fix Priority for Weekend Hackathon (24-48 hrs)

### Phase 1 — Must fix before demo (show-stoppers, ~1.5 hrs total)
1. **BUG-06** — Recommendation priority tautology (5 min, one line)
2. **BUG-05** — Seed synthetic forecast with station name hash (10 min)
3. **BUG-02** — Fix `self.df is None` guard bypassing synthetic model (10 min)
4. **BUG-18** — Add error display in Forecast.jsx (15 min)
5. **BUG-01** — Clarify PM2.5 → AQI unit handling in predict() (30 min)

### Phase 2 — Fix for judge evaluation score (~3.5 hrs)
6. **BUG-04** — Add persistence baseline RMSE to forecast response (30 min)
7. **BUG-03** — Swap rule-based attribution to XGBoost + SHAP (2 hrs)
8. **BUG-08** — Add Hindi summary fields to NLG output (30 min)
9. **BUG-07** — Replace hyphen-split fuzzy match with `difflib` (15 min)

### Phase 3 — Defer to post-hackathon
- **BUG-10, BUG-11, BUG-15, BUG-17** — Performance / query optimization
- **BUG-12, BUG-13, BUG-16** — Data quality / admin
- **BUG-14** — Security (secret key management)
- **BUG-19, BUG-20, BUG-21, BUG-22** — Frontend reliability
