@echo off
cd /d "%~dp0"
echo ================================================
echo   Starting Backend Server
echo ================================================
echo.

if not exist "dist\main.js" (
    echo Error: dist/main.js not found!
    echo Please build the project first using BUILD_ONLY.bat
    echo.
    pause
    exit /b 1
)

echo Starting server from dist/main.js...
echo.
echo ================================================
echo   Server is running...
echo   Press Ctrl+C to stop
echo ================================================
echo.

node dist/main.js
