@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Installing Real-time Messaging Dependencies
echo ================================================
echo.

echo Installing Socket.io and WebSockets...
call npm install socket.io @nestjs/websockets @nestjs/platform-socket.io --save

echo.
echo Installing Multer for file uploads...
call npm install multer @types/multer @nestjs/platform-express --save

echo.
echo ================================================
echo   Installation Complete!
echo ================================================
pause
