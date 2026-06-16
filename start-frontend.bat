@echo off
REM Start ONLY the frontend (Vite dev server, usually port 5173).
cd /d %~dp0
echo Starting frontend (Vite) ...
npm run dev
