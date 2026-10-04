@echo off
title LegalGPT React Frontend (Port 5173)
echo ===================================================
echo   Starting LegalGPT Vite React Frontend...
echo ===================================================
cd /d "%~dp0artifacts\legal-gpt"

if not exist "node_modules" (
    echo Installing node dependencies...
    call npx pnpm install
)

echo.
echo Launching Vite Dev Server on http://localhost:5173...
call npx pnpm run dev
pause
