@echo off
setlocal enabledelayedexpansion
title WEB Classroom Tool - Launcher
cd /d "%~dp0"

echo ============================================
echo   WEB Classroom Interactive Tool - Startup
echo ============================================
echo.

rem ------------------------------------------------------
rem 1. Locate a usable Python (prefer the py launcher)
rem ------------------------------------------------------
set "PYEXE="
where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PYEXE=py"
) else (
    where python >nul 2>nul
    if !errorlevel! equ 0 (
        set "PYEXE=python"
    )
)

if "%PYEXE%"=="" (
    echo [INFO] Python not found. Attempting automatic install...
    echo.
    where winget >nul 2>nul
    if !errorlevel! neq 0 (
        echo [ERROR] winget is not available, cannot auto-install Python.
        echo Please download and install Python manually from:
        echo https://www.python.org/downloads/
        echo IMPORTANT: check "Add python.exe to PATH" during install,
        echo then run this launcher again.
        echo.
        pause
        exit /b 1
    )

    echo Installing Python via winget, please wait ^(internet required^)...
    winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Automatic Python install failed.
        echo Please install manually from https://www.python.org/downloads/
        echo.
        pause
        exit /b 1
    )

    echo.
    echo [DONE] Python installed successfully.
    echo Please CLOSE this window and double-click this launcher again.
    echo ^(A new window is needed so Windows picks up the updated PATH.^)
    echo.
    pause
    exit /b 0
)

echo [OK] Python detected:
%PYEXE% --version
echo.

rem ------------------------------------------------------
rem 2. Make sure pip is available
rem ------------------------------------------------------
%PYEXE% -m pip --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] pip not found, attempting repair...
    %PYEXE% -m ensurepip --upgrade >nul 2>nul
)

rem ------------------------------------------------------
rem 3. Check required packages, install if missing
rem ------------------------------------------------------
echo [CHECK] Verifying required packages (PyQt5, PyQtWebEngine, qrcode, Pillow)...
%PYEXE% -c "import PyQt5, PyQt5.QtWebEngineWidgets, qrcode, PIL" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INSTALL] Missing packages detected, installing now ^(internet required^)...
    %PYEXE% -m pip install --upgrade pip
    %PYEXE% -m pip install PyQt5 PyQtWebEngine qrcode Pillow
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Package installation failed. Check your internet connection
        echo and try again, or run manually:
        echo   %PYEXE% -m pip install PyQt5 PyQtWebEngine qrcode Pillow
        echo.
        pause
        exit /b 1
    )
    echo [DONE] Packages installed successfully.
) else (
    echo [OK] All required packages are already installed.
)

rem ------------------------------------------------------
rem 4. Launch the app (prefer pythonw, no console window)
rem ------------------------------------------------------
echo.
echo [START] Launching WEB Classroom Interactive Tool...

if not exist "%~dp0web_exe2.py" (
    echo.
    echo [ERROR] web_exe2.py not found. Make sure this launcher and
    echo web_exe2.py are in the same folder.
    echo.
    pause
    exit /b 1
)

set "PYW_EXECUTABLE="
for /f "delims=" %%P in ('%PYEXE% -c "import sys;print(sys.executable)" 2^>nul') do set "PY_EXECUTABLE=%%P"
if defined PY_EXECUTABLE (
    set "PYW_EXECUTABLE=!PY_EXECUTABLE:python.exe=pythonw.exe!"
)

if defined PYW_EXECUTABLE if exist "!PYW_EXECUTABLE!" (
    start "" "!PYW_EXECUTABLE!" "%~dp0web_exe2.py"
) else (
    start "" %PYEXE% "%~dp0web_exe2.py"
)

exit /b 0
