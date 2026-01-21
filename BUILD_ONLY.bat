@echo off
cd /d "%~dp0"
echo ================================================
echo   Building Backend
echo ================================================
echo.

echo Current directory: %CD%
echo.

echo [1/2] Installing dependencies...
call npm install --legacy-peer-deps
echo.

echo [2/2] Building with TypeScript...
call npx tsc -p tsconfig.build.json
echo.

if exist "dist\main.js" (
    echo ================================================
    echo   Build Successful!
    echo ================================================
    echo.
    echo You can now run: node dist/main.js
    echo Or use: START_SERVER.bat
) else (
    echo ================================================
    echo   Build Failed!
    echo ================================================
)

pause
