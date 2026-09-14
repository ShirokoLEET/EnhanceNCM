@echo off
setlocal EnableExtensions

rem NetEase Cloud Music CEF remote debugging launcher.
set "NCM_DIR=C:\Program Files\NetEase\CloudMusic"
set "NCM_EXE=%NCM_DIR%\cloudmusic.exe"
set "DEBUG_HOST=127.0.0.1"
set "DEBUG_PORT=9222"
set /a ATTEMPT=0

if not exist "%NCM_EXE%" goto NO_EXE

rem Reuse an already running debug endpoint when present.
curl.exe --silent --show-error --max-time 1 "http://%DEBUG_HOST%:%DEBUG_PORT%/json/version" >nul 2>&1
if not errorlevel 1 goto OPEN_DEBUG_PAGE

rem The first Cloud Music instance must receive the debug flags.
tasklist /FI "IMAGENAME eq cloudmusic.exe" | findstr /I /C:"cloudmusic.exe" >nul
if not errorlevel 1 goto ALREADY_RUNNING

pushd "%NCM_DIR%"
start "NetEase Cloud Music - Web Debug" "%NCM_EXE%" --remote-debugging-address=%DEBUG_HOST% --remote-debugging-port=%DEBUG_PORT% --remote-allow-origins=*
set "START_ERROR=%ERRORLEVEL%"
popd
if not "%START_ERROR%"=="0" goto LAUNCH_FAILED

echo Waiting for the CEF debugging endpoint at http://%DEBUG_HOST%:%DEBUG_PORT% ...

:WAIT_FOR_DEBUG
curl.exe --silent --show-error --max-time 1 "http://%DEBUG_HOST%:%DEBUG_PORT%/json/version" >nul 2>&1
if not errorlevel 1 goto OPEN_DEBUG_PAGE
set /a ATTEMPT+=1
if %ATTEMPT% GEQ 20 goto TIMEOUT
timeout /t 1 /nobreak >nul
goto WAIT_FOR_DEBUG

:OPEN_DEBUG_PAGE
echo Web debugging is available at http://%DEBUG_HOST%:%DEBUG_PORT%
start "" "http://%DEBUG_HOST%:%DEBUG_PORT%/json/list"
exit /b 0

:NO_EXE
echo [ERROR] cloudmusic.exe was not found at:
echo         %NCM_EXE%
exit /b 1

:ALREADY_RUNNING
echo [ERROR] cloudmusic.exe is already running without the debug endpoint.
echo         Close Cloud Music completely, then run this BAT again.
exit /b 2

:LAUNCH_FAILED
echo [ERROR] Failed to start cloudmusic.exe.
exit /b 3

:TIMEOUT
echo [ERROR] The CEF debugging endpoint did not start within 20 seconds.
echo         Check the Cloud Music window and its debug.log file.
exit /b 4
