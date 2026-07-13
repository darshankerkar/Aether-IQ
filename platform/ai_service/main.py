"""
FastAPI AI Service — AQI Intelligence Platform
Handles: ML Forecasting, Source Attribution, Recommendations, What-if Simulation
Port: 8001
"""
import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Add project root to path so agents can import shared utils
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from agents.forecasting  import ForecastingAgent
from agents.attribution  import AttributionAgent
from agents.recommendation import RecommendationAgent
from agents.simulator    import SimulatorAgent
from agents.nlg          import NLGAgent

# ──────────────────────────────────────────────
# Shared agent instances (loaded on startup)
# ──────────────────────────────────────────────
DATA_DIR = ROOT.parent.parent / "data" / "processed"
forecast_agent    = None
attribution_agent = None
recommend_agent   = None
simulator_agent   = None
nlg_agent         = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Train ML models on startup."""
    global forecast_agent, attribution_agent, recommend_agent, simulator_agent, nlg_agent

    print("[AQI] Initialising AI agents...")
    forecast_agent    = ForecastingAgent(DATA_DIR)
    attribution_agent = AttributionAgent(DATA_DIR)
    recommend_agent   = RecommendationAgent()
    simulator_agent   = SimulatorAgent()
    nlg_agent         = NLGAgent()

    print("  Training Forecasting model...")
    forecast_agent.train()
    print("  Training Attribution model...")
    attribution_agent.train()
    print("[AQI] All agents ready.")
    yield
    print("[AQI] AI Service shutting down.")


app = FastAPI(
    title="AQI Intelligence AI Service",
    description="Multi-agent AI backend for Urban Air Quality Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────────────────────────────────────────
# Pydantic request/response models
# ──────────────────────────────────────────────
class SimulationRequest(BaseModel):
    station_name: str
    current_aqi: float
    current_pm25: Optional[float] = None
    current_pm10: Optional[float] = None
    reduce_traffic_pct: float = 0.0       # 0–100
    restrict_construction: bool = False
    reduce_industrial_pct: float = 0.0    # 0–100
    increase_green_cover: bool = False
    wind_speed_boost: float = 0.0         # additional km/h


# ──────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "agents": ["forecasting", "attribution", "recommendation", "simulator", "nlg"]}


# ──────────────────────────────────────────────
# Endpoint 1: AQI Forecast
# ──────────────────────────────────────────────
@app.get("/forecast/{station_name}")
async def get_forecast(station_name: str):
    """
    Returns 6hr / 24hr / 72hr AQI forecasts for a given station.
    """
    if forecast_agent is None:
        raise HTTPException(503, "Forecasting agent not ready")

    result = forecast_agent.predict(station_name)
    if result is None:
        raise HTTPException(404, f"No data for station: {station_name}")
    return result


# ──────────────────────────────────────────────
# Endpoint 2: Source Attribution
# ──────────────────────────────────────────────
@app.get("/attribution/{station_name}")
async def get_attribution(station_name: str):
    """
    Returns pollution source breakdown (traffic/construction/industrial/others) 
    with confidence scores for a given station.
    """
    if attribution_agent is None:
        raise HTTPException(503, "Attribution agent not ready")

    result = attribution_agent.attribute(station_name)
    if result is None:
        raise HTTPException(404, f"No data for station: {station_name}")
    return result


# ──────────────────────────────────────────────
# Endpoint 3: Ranked Recommendations
# ──────────────────────────────────────────────
@app.get("/recommendations/{station_name}")
async def get_recommendations(station_name: str):
    """
    Returns ranked intervention recommendations with estimated AQI reduction.
    """
    attribution = attribution_agent.attribute(station_name)
    forecast    = forecast_agent.predict(station_name)
    return recommend_agent.generate(station_name, attribution, forecast)


# ──────────────────────────────────────────────
# Endpoint 4: What-if Simulation
# ──────────────────────────────────────────────
@app.post("/simulate")
async def run_simulation(req: SimulationRequest):
    """
    Simulates the AQI impact of one or more interventions.
    Returns predicted AQI delta and pollutant-level breakdown.
    """
    return simulator_agent.simulate(req.dict())


# ──────────────────────────────────────────────
# Endpoint 5: AI Explanation
# ──────────────────────────────────────────────
@app.get("/explain/{station_name}")
async def explain_aqi(station_name: str, aqi: float = Query(...)):
    """
    Generates a natural-language explanation of why AQI is at current level.
    """
    attribution = attribution_agent.attribute(station_name)
    forecast    = forecast_agent.predict(station_name)
    return nlg_agent.explain(station_name, aqi, attribution, forecast)


# ──────────────────────────────────────────────
# Endpoint 6: Bulk station stats (for map overlay)
# ──────────────────────────────────────────────
@app.get("/bulk-attribution")
async def bulk_attribution(limit: int = Query(50)):
    """Returns attribution for all stations (cached from last training run)."""
    if attribution_agent is None:
        raise HTTPException(503, "Attribution agent not ready")
    return attribution_agent.bulk_summary(limit)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False, log_level="info")
