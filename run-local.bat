@echo off
title EPIC Command - Local Runner
color 0A

echo =================================================================
echo         EPIC COMMAND - LOCAL DEVELOPMENT RUNNER
echo =================================================================
echo.

echo [1/3] Checking dependencies...
if not exist "frontend\node_modules\" (
    echo [*] Installing frontend packages...
    cd frontend
    call npm install
    cd ..
)

echo [2/3] Starting Backend API (FastAPI + MediaMTX + SQLite)...
start "EPIC Command - Backend (Port 8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Starting Frontend Dev Server (Vite Port 5173)...
start "EPIC Command - Frontend (Port 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo =================================================================
echo [*] Backend running at : http://127.0.0.1:8000
echo [*] Frontend running at: http://localhost:5173
echo [*] Default Login      : admin / Admin@12345
echo =================================================================
echo.
timeout /t 3 >nul
start http://localhost:5173
pause

