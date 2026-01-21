@echo off
echo ================================================
echo   Quick Fix - Social Media Backend
echo ================================================
echo.

cd /d "%~dp0"

echo [1/3] Installing/Updating TypeScript...
call npm install typescript@latest --save-dev
echo.

echo [2/3] Building project...
call npm run build
echo.

if %ERRORLEVEL% EQU 0 (
    echo ================================================
    echo   Build Successful!
    echo ================================================
    echo.
    echo [3/3] Starting development server...
    echo.
    call npm run start:dev
) else (
    echo ================================================
    echo   Build Failed!
    echo ================================================
    echo.
    echo Please check the errors above.
    pause
)
