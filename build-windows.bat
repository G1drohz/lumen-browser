@echo off
setlocal
cd /d "%~dp0desktop"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Installing Node.js LTS via winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js installed. CLOSE this window and run build-windows.bat again.
  pause
  exit /b 0
)

echo [1/2] Installing dependencies...
call npm install
if errorlevel 1 (
  echo npm install failed.
  pause
  exit /b 1
)

echo [2/2] Building the installer...
call npm run dist -- --win --x64
if errorlevel 1 (
  echo Build failed. If you see a symbolic link error, enable Windows Developer Mode or run this file as Administrator.
  pause
  exit /b 1
)

echo.
echo Done. The installer is in desktop\dist  (Lumen-Setup-x.y.z.exe)
start "" "%~dp0desktop\dist"
pause
