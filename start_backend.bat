@echo off
cd /d "%~dp0"
if exist "backend" cd backend

echo ============================================================
echo   Starting Coronary AI Research Backend (FastAPI + Uvicorn)
echo   API URL: http://localhost:8000/api/health
echo ============================================================
echo.

if exist ".venv\Scripts\python.exe" (
    echo Using backend virtual environment (.venv)...
    .venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
) else (
    echo Using system Python...
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
)

pause
