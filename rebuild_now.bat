@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==========================================
echo   Rebuilding Backend with new features
echo ==========================================
echo.

echo Current directory: %CD%
echo.

echo Installing TypeScript...
call npm install typescript --save-dev

echo.
echo Building with tsc...
call npx tsc -p tsconfig.build.json

echo.
echo ==========================================
echo   Build Complete!
echo ==========================================
echo.
echo Ready to run: node dist\main.js
pause
