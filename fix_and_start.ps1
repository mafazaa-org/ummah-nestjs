# Fix and Start Backend Script
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "    Social Media Backend - Fix & Start" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "[1/5] Checking current location..." -ForegroundColor Yellow
Write-Host "Current directory: $(Get-Location)" -ForegroundColor Gray
Write-Host ""

Write-Host "[2/5] Removing old TypeScript installation..." -ForegroundColor Yellow
if (Test-Path "node_modules\typescript") {
    Remove-Item -Recurse -Force "node_modules\typescript" -ErrorAction SilentlyContinue
    Write-Host "✓ Old TypeScript removed" -ForegroundColor Green
} else {
    Write-Host "✓ No old TypeScript found" -ForegroundColor Green
}
Write-Host ""

Write-Host "[3/5] Installing/Updating TypeScript..." -ForegroundColor Yellow
npm install typescript@latest --save-dev
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ TypeScript installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Failed to install TypeScript" -ForegroundColor Red
    pause
    exit 1
}
Write-Host ""

Write-Host "[4/5] Building project..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Build successful" -ForegroundColor Green
} else {
    Write-Host "✗ Build failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Trying alternative build method..." -ForegroundColor Yellow
    npx nest build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Build successful (using npx)" -ForegroundColor Green
    } else {
        Write-Host "✗ Build failed" -ForegroundColor Red
        pause
        exit 1
    }
}
Write-Host ""

Write-Host "[5/5] Starting development server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "    Server will start now..." -ForegroundColor Cyan
Write-Host "    Press Ctrl+C to stop" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

npm run start:dev
