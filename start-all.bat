@echo off
REM ============================================================
REM  HealthForecast — start BOTH servers (backend + frontend)
REM  Double-click this file to launch everything.
REM ============================================================
echo Starting HealthForecast...
echo.

start "HealthForecast Backend (port 8000)" cmd /k "cd /d %~dp0api && .venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"

start "HealthForecast Frontend (port 5173)" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo   Backend : http://127.0.0.1:8000
echo   Frontend: http://localhost:5173
echo.
echo Two windows opened. Close them to stop the servers.
echo (Reminder: after a backend restart, rebuild G1 and G3 on the Prepare page.)
pause
