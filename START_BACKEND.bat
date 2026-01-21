@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   Starting Backend on PORT 3000
echo ==========================================
echo.

REM Set PORT environment variable
set PORT=3000

REM Build if needed
if not exist "dist\main.js" (
    echo Building...
    call npx tsc -p tsconfig.build.json
)

REM Run server
echo Starting server on http://localhost:3000
node dist\main.js
