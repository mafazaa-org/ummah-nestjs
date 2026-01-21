@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   Backend Server Starting...
echo ================================================
echo.
echo Current directory: %CD%
echo.

if not exist "dist\main.js" (
    echo ERROR: dist\main.js not found!
    echo Building project first...
    echo.
    call npm install typescript --save-dev
    call npx typescript -p tsconfig.build.json
    echo.
)

if exist "dist\main.js" (
    echo Starting server from dist\main.js...
    echo.
    echo ================================================
    echo   Server running on http://localhost:3000
    echo   Press Ctrl+C to stop
    echo ================================================
    echo.
    node dist\main.js
) else (
    echo.
    echo ERROR: Failed to build project!
    pause
)
