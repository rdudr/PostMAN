@echo off
setlocal
title Push PostMan

REM  Clones PostMAN fresh, applies the patch sitting next to this file, and
REM  pushes. A fresh clone every time on purpose: applying a patch onto a
REM  folder with half-finished work in it is how the last attempt got stuck.

set "PATCHDIR=%~dp0"
set "WORK=%TEMP%\postman-push-%RANDOM%"

echo.
echo   Pushing PostMan
echo   ---------------
echo.

if not exist "%PATCHDIR%1-PostMan.patch" (
  echo   Cannot find 1-PostMan.patch next to this file.
  echo   Expected it in: %PATCHDIR%
  goto :stop
)

echo   [1/3] Getting a clean copy from GitHub...
git clone --quiet https://github.com/rdudr/PostMAN.git "%WORK%"
if errorlevel 1 (
  echo.
  echo   Could not clone. Check your internet connection.
  goto :stop
)

cd /d "%WORK%"

echo   [2/3] Applying the patch...
git am "%PATCHDIR%1-PostMan.patch"
if errorlevel 1 (
  echo.
  echo   The patch did not apply. Nothing has been pushed and nothing is broken.
  echo   Copy everything above this line and send it to Claude.
  goto :stop
)

echo   [3/3] Pushing to GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo   The push was refused. Usually that means git needs your GitHub
  echo   sign-in - a browser window may have opened behind this one.
  echo   Nothing has been pushed.
  goto :stop
)

echo.
echo   Done. GitHub has it, and Vercel will redeploy post-man-iota.vercel.app
echo   on its own within a minute or two.
echo.

:stop
echo.
echo   Press any key to close.
pause >nul
endlocal
