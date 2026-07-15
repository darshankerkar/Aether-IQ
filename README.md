# AetherIQ

AetherIQ is an AI-powered urban air quality intelligence platform designed for proactive, evidence-based intervention in smart cities. Moving beyond simple reporting, AetherIQ provides real-time forecasting, source attribution, and policy simulation to help municipal and pollution control authorities combat severe air quality crises.

## Core Features

- **Real-Time Dashboards:** Continuous monitoring of AQI and pollutant levels (PM2.5, PM10) across national, city, and station-level granularities.
- **AI Forecasting Engine:** 6h, 24h, and 72h predictive modeling of AQI leveraging Random Forest and meteorological data fusion.
- **Source Attribution:** Statistical models attributing pollution to specific categories (Traffic, Industrial, Construction) to identify key emission sources.
- **Enforcement Intelligence:** Prioritized action recommendations for city officials to enforce immediate, high-impact air quality control measures.
- **What-If Simulator:** A predictive simulator allowing policymakers to estimate the AQI reduction and health impact of interventions before implementation (e.g., reducing vehicular traffic or restricting construction).
- **Citizen Health Portal:** Ward-level health advisories, school activity guidelines, and multilingual public safety alerts based on real-time AQI.

## Architecture & Technology Stack

The platform is designed with a scalable microservices architecture:

- **Frontend:** React.js, Vite, Chart.js, Leaflet, Lucide-React
- **Core Backend:** Django, Django Rest Framework (Data aggregation, CRUD APIs, models)
- **AI & Analytics Service:** FastAPI, Scikit-Learn, Pandas, NumPy (Machine learning models, forecasting, simulations)
- **Database:** SQLite (Development) / PostgreSQL (Production)

## Project Structure

- `/platform/frontend`: React application containing the user interface.
- `/platform/backend`: Django backend managing core data models and RESTful APIs.
- `/platform/ai_service`: FastAPI service hosting the machine learning models and simulation logic.
- `/data`: Raw and processed datasets used for model training and historical data.

## Local Development Setup

### Prerequisites
- Python 3.9+
- Node.js 18+
- npm or yarn

### 1. Django Backend
```bash
cd platform/backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 2. FastAPI AI Service
```bash
cd platform/ai_service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py  # Runs on port 8001
```

### 3. React Frontend
```bash
cd platform/frontend
npm install
npm run dev  # Runs on port 5173
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.
