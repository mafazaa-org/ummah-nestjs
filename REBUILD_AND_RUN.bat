@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   🔥 FORCE REBUILD BACKEND
echo ==========================================
echo.

echo 🗑️  Cleaning old build...
if exist dist rmdir /s /q dist
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo.
echo 🔨 Building TypeScript...
call npx tsc -p tsconfig.build.json

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo.
echo ✅ Build successful!
echo.
echo 🚀 Starting server on http://localhost:3000/api
echo.
echo Press Ctrl+C to stop
echo.

node dist/main.js
