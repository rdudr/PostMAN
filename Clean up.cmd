@echo off
title PostMan - clean up
cd /d "%~dp0"

echo.
echo   This removes everything PostMan no longer needs, so the folder holds
echo   one tool and your source material, nothing else.
echo.
echo     PostMan.cmd      the old launcher
echo     serve.js         the local server it used
echo     vendor\          libraries it cached
echo     _old\            files already retired earlier
echo.
echo   Kept: PostMan.html, README.md, report design\, sample bills\,
echo         sample reports\, logos\, and the sample outputs.
echo.
pause

if exist "PostMan.cmd"         del /q "PostMan.cmd"
if exist "Start PostMan dev server.cmd" del /q "Start PostMan dev server.cmd"
if exist "Open PostMan.cmd"    del /q "Open PostMan.cmd"
if exist "PostMan-offline.html" del /q "PostMan-offline.html"
if exist "serve.js"            del /q "serve.js"
if exist "vendor"              rd /s /q "vendor"
if exist "_old"                rd /s /q "_old"

echo.
echo   Done. PostMan.html is the whole tool - double-click it.
echo   This window closes when you press a key, and this file deletes itself.
echo.
pause

rem Delete this script last, once it has finished running.
start /b "" cmd /c del /q "%~f0"
