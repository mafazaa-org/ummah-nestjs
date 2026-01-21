@echo off
cd /d "%~dp0"
echo Building NestJS Backend...
echo.

REM Build the project
call npx nest build

echo.
echo Build completed!
pause
