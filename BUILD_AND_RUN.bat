@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Building and Running Backend
echo ================================================
echo.
echo Current directory: %CD%
echo.

echo [1/2] Building project with TypeScript...
call node_modules\.bin\tsc.cmd -p tsconfig.build.json

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Build failed! Checking if dist exists...
    if not exist "dist\main.js" (
        echo ERROR: dist\main.js not found!
        pause
        exit /b 1
    )
    echo dist\main.js exists, continuing...
)

echo.
echo [2/2] Starting server...
echo.
echo ================================================
echo   Server running on http://localhost:3000
echo   Press Ctrl+C to stop
echo ================================================
echo.

node dist\main.js
