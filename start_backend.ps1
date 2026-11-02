$backendDir = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path $backendDir)) { $backendDir = $PSScriptRoot }
Set-Location $backendDir

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting Coronary AI Research Backend (FastAPI + Uvicorn)  " -ForegroundColor Green
Write-Host "  API URL: http://localhost:8000/api/health                 " -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

$pythonExe = Join-Path $backendDir ".venv\Scripts\python.exe"
if (Test-Path $pythonExe) {
    & $pythonExe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
} else {
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
}
