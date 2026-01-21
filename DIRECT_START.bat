@echo off
cd /d "%~dp0"
echo ================================================
echo   Starting Backend Directly
echo ================================================
echo.

echo Current directory: %CD%
echo.

echo [1/4] Checking Node.js...
node --version
echo.

echo [2/4] Reinstalling @nestjs/cli...
call npm install @nestjs/cli --save-dev --legacy-peer-deps
echo.

echo [3/4] Building with local CLI...
call node_modules\.bin\nest build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed, trying with tsc...
    call npx tsc -p tsconfig.build.json
)
echo.

echo [4/4] Starting server...
if exist "dist\main.js" (
    echo Starting from dist/main.js...
    node dist/main.js
) else (
    echo Error: dist/main.js not found!
    pause
)
