@echo off
cd /d "%~dp0"
if exist "backend" cd backend

echo ============================================================
echo   Starting Coronary AI Research Backend (FastAPI + Uvicorn)
echo   API URL: http://localhost:8000/api/health
echo ============================================================
echo.

if exist ".venv\Scripts\python.exe" (
<<<<<<< HEAD
    echo Starting server with virtual environment...
    .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else (
    echo Starting server with system Python...
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
=======
    echo Using backend virtual environment (.venv)...
    .venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
) else (
    echo Using system Python...
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
>>>>>>> 4d47fb02b9c2d1e7067ce6a724ba56a62b2a46a4
)

pause
