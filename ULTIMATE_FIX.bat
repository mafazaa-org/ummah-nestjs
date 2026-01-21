@echo off
REM ================================================
REM   Ultimate Fix - Social Media Backend
REM ================================================

cd /d "%~dp0"
echo Current directory: %CD%
echo.

echo ================================================
echo   Step 1: Clean Installation
echo ================================================
echo.

echo Removing old files...
if exist node_modules rd /s /q node_modules
if exist package-lock.json del /f package-lock.json
echo Done!
echo.

echo Installing dependencies...
call npm install --legacy-peer-deps
echo.

echo ================================================
echo   Step 2: Building Project
echo ================================================
echo.

echo Building with TypeScript...
call npx typescript -p tsconfig.build.json
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Trying alternative: node_modules\.bin\tsc
    call node_modules\.bin\tsc -p tsconfig.build.json
)
echo.

echo ================================================
echo   Step 3: Starting Server
echo ================================================
echo.

if exist dist\main.js (
    echo Server starting...
    echo.
    echo ================================================
    echo   Backend is running on http://localhost:3000
    echo   Press Ctrl+C to stop
    echo ================================================
    echo.
    node dist\main.js
) else (
    echo.
    echo ERROR: Build failed! dist\main.js not found
    echo.
    pause
)
