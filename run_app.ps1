Write-Host "Starting Smart Literature Claim Mapper..." -ForegroundColor Cyan
Write-Host "Server running at: http://127.0.0.1:8000" -ForegroundColor Green

& .\.venv\Scripts\uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
