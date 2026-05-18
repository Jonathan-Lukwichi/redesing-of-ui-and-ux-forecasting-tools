# HealthForecast AI — Frontend and Backend

React + Vite frontend with a FastAPI backend for the HealthForecast AI hospital
demand forecasting application. Companion project to
[msc-thesis--exploratory-data-analysis](https://github.com/Jonathan-Lukwichi/msc-thesis--exploratory-data-analysis).

## Project structure

```
.
├── api/                    FastAPI backend
│   ├── main.py             app entry, CORS, router wiring
│   ├── requirements.txt
│   ├── core/               forecasting + optimisation
│   │   ├── forecasting.py  ARIMA / SARIMA + ML
│   │   ├── optimization.py staff + supply heuristics
│   │   └── schemas.py
│   └── routers/            forecast, staff, supply, kpis, upload, actions
├── src/                    React frontend
│   ├── App.jsx             page switcher
│   ├── components/         AppShell, Charts, KPI, PageHero
│   ├── pages/              15 dashboard pages
│   └── api/client.js       fetch wrapper for the backend
├── public/images/          hero images
├── project/                original HTML/CSS/JS prototypes
├── package.json
├── vite.config.js
└── RUN.md                  how to start both servers locally
```

## Run locally

Backend (port 8000):

```powershell
cd api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend (port 5173):

```powershell
npm install
npm run dev
```

Open http://localhost:5173 and navigate to **Forecast** for the first wired page.

## Wired pages

| Page | Endpoint |
|---|---|
| Forecast | `GET /api/forecast/demo` |
| others | mock data, wiring in progress |

## Companion repositories

- EDA pipeline: [msc-thesis--exploratory-data-analysis](https://github.com/Jonathan-Lukwichi/msc-thesis--exploratory-data-analysis)
- Upstream ETL: [msc-thesis--data-transformation-pipeline-](https://github.com/Jonathan-Lukwichi/msc-thesis--data-transformation-pipeline-)
