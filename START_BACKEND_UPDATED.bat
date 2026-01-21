@echo off
echo ============================================
echo    Starting Backend with Updated Code
echo ============================================
echo.

cd /d "%~dp0"

echo Starting backend server...
npm run start:dev

pause
