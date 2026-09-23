@echo off
title PostMan
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed, or not on the PATH.
  echo   Install it from https://nodejs.org  ^(the LTS build^), then run this again.
  echo.
  pause
  exit /b 1
)

node "%~dp0serve.js"

echo.
echo   PostMan has stopped.
pause
