@echo off
title SafePay Server
color 0A

echo ========================================================
echo                 STARTING SAFEPAY SYSTEM
echo ========================================================
echo.
echo Please wait while the environment starts up...
echo The browser will open automatically in a few seconds.
echo.
echo IMPORTANT: DO NOT close this window during your presentation!
echo.

cd /d "%~dp0"

:: This starts a background timer that will open your browser tabs after 3 seconds
start /b cmd /c "timeout /t 3 /nobreak > NUL && start http://localhost:5173/ && start http://localhost:5173/sql"

:: This starts the actual server
npm run dev
