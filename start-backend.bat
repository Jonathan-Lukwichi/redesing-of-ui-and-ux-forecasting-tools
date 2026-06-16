@echo off
REM Start ONLY the backend API (FastAPI on port 8000).
cd /d %~dp0api
echo Starting backend on http://127.0.0.1:8000 ...
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
