@echo off
title LegalGPT Launcher
echo ===================================================
echo   Launching LegalGPT Backend & Frontend...
echo ===================================================

start "LegalGPT Backend" cmd /k "%~dp0run_backend.bat"
timeout /t 3
start "LegalGPT Frontend" cmd /k "%~dp0run_frontend.bat"

echo.
echo Both servers are starting up!
echo - Flask Backend:  http://localhost:8080
echo - React Frontend: http://localhost:5173
echo.
