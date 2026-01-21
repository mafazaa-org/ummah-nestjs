@echo off
cd /d "%~dp0"
echo Starting NestJS Backend...
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start the development server
echo Starting development server...
call npx nest start --watch

pause
