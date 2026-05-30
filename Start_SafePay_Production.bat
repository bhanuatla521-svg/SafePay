@echo off
title SafePay Production Server
color 0B

echo ========================================================
echo          STARTING SAFEPAY SYSTEM (PRODUCTION/COMPRESSED)
echo ========================================================
echo.
echo Please wait while the application builds and starts up...
echo The browser will open automatically in a few seconds.
echo.

cd /d "%~dp0"

echo [1/2] Building and compressing React frontend assets...
call npm run build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ ERROR: Frontend build failed! Please check your code.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo [2/2] Starting SafePay Production Server on port 4000...
:: Starts a background command to open browser tabs after 3 seconds
start /b cmd /c "timeout /t 3 /nobreak > NUL && start http://localhost:4000/ && start http://localhost:4000/sql"

:: Starts the actual node server
npm start
