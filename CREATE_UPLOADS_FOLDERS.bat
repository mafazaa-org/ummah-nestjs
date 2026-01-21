@echo off
cd /d "%~dp0"

echo ================================================
echo   Creating Upload Folders
echo ================================================
echo.

if not exist "uploads" mkdir uploads
if not exist "uploads\posts" mkdir uploads\posts
if not exist "uploads\messages" mkdir uploads\messages
if not exist "uploads\stories" mkdir uploads\stories
if not exist "uploads\avatars" mkdir uploads\avatars

echo ================================================
echo   Folders Created Successfully!
echo ================================================
echo.
echo Created:
echo   - uploads\posts
echo   - uploads\messages
echo   - uploads\stories
echo   - uploads\avatars
echo.
pause
