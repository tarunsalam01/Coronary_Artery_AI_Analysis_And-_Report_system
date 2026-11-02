@echo off
cd /d "%~dp0"
if exist "backend" cd backend

echo ============================================================
echo   Starting Coronary AI Research Backend (FastAPI + Uvicorn)
echo   API URL: http://localhost:8000/api/health
echo ============================================================
echo.

if exist ".venv\Scripts\python.exe" (
    echo Starting server with virtual environment...
    .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else (
    echo Starting server with system Python...
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
)

pause
