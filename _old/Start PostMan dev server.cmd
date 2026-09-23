@echo off
title PostMan dev server
cd /d "%~dp0postman"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on the PATH.
  echo Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

if not exist "node_modules\next" (
  echo Installing dependencies, this takes a couple of minutes...
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo Install failed. Read the message above, then close this window.
    pause
    exit /b 1
  )
)

echo Starting the dev server. Leave this window open.
echo The browser opens at http://localhost:3000 in a few seconds.
start "" /min cmd /c "timeout /t 6 >nul & start http://localhost:3000/setup"
call npm.cmd run dev

echo.
echo The server stopped.
pause
