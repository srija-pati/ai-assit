@echo off
title LegalGPT Flask Backend (Port 8080)
echo ===================================================
echo   Starting LegalGPT Flask Backend API Server...
echo ===================================================
cd /d "%~dp0artifacts\flask-api"

if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate
echo Installing dependencies from requirements.txt...
pip install -r requirements.txt

echo.
echo Launching Flask API on http://localhost:8080...
python app.py
pause
