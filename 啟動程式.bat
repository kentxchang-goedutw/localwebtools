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

rem ------------------------------------------------------
rem 1b. Reject the Microsoft Store "python.exe" / "python3.exe" app
rem     execution alias. It reports a real version number and looks
rem     fine, but it runs in a sandbox that blocks pip/ensurepip from
rem     writing packages, so treat it the same as "Python not found"
rem     and install the real thing instead.
rem ------------------------------------------------------
if not "%PYEXE%"=="" (
    set "RESOLVED_PY="
    for /f "delims=" %%P in ('%PYEXE% -c "import sys;print(sys.executable)" 2^>nul') do set "RESOLVED_PY=%%P"
    echo !RESOLVED_PY! | findstr /I "WindowsApps" >nul 2>nul
    if !errorlevel! equ 0 (
        echo [INFO] Detected the Microsoft Store Python app-execution alias:
        echo   !RESOLVED_PY!
        echo This version is sandboxed and cannot reliably install pip
        echo packages. Ignoring it and installing the official Python
        echo from python.org instead...
        echo.
        set "PYEXE="
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
rem 2. Make sure pip is available (verify AFTER repair, with a
rem    get-pip.py fallback for Python builds that ship without pip
rem    and where ensurepip itself cannot bootstrap it)
rem ------------------------------------------------------
set "PIP_OK=0"
%PYEXE% -m pip --version >nul 2>nul
if %errorlevel% equ 0 (
    set "PIP_OK=1"
) else (
    echo [INFO] pip not found, attempting repair via ensurepip...
    %PYEXE% -m ensurepip --upgrade --default-pip
    %PYEXE% -m pip --version >nul 2>nul
    if !errorlevel! equ 0 (
        set "PIP_OK=1"
    )
)

if "!PIP_OK!"=="0" (
    echo [INFO] ensurepip could not install pip, downloading get-pip.py instead ^(internet required^)...
    set "GETPIP=%TEMP%\get-pip.py"
    if exist "!GETPIP!" del /f /q "!GETPIP!" >nul 2>nul
    where curl >nul 2>nul
    if !errorlevel! equ 0 (
        curl -sSL -o "!GETPIP!" https://bootstrap.pypa.io/get-pip.py
    ) else (
        powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile '!GETPIP!' } catch { exit 1 }"
    )
    if exist "!GETPIP!" (
        %PYEXE% "!GETPIP!"
        %PYEXE% -m pip --version >nul 2>nul
        if !errorlevel! equ 0 set "PIP_OK=1"
    )
)

if "!PIP_OK!"=="0" (
    echo.
    echo [ERROR] Could not install pip on this Python installation:
    echo   !RESOLVED_PY!
    echo This usually means either ^(a^) this network blocks access to
    echo bootstrap.pypa.io / PyPI, or ^(b^) this is a restricted Python
    echo build ^(e.g. installed from the Microsoft Store^) that cannot
    echo write packages even though it reports a version number.
    echo Please install the official Python from https://www.python.org/downloads/
    echo ^(make sure "pip" stays checked during install^), then run this
    echo launcher again.
    echo.
    pause
    exit /b 1
)
echo [OK] pip is available.
echo.

rem ------------------------------------------------------
rem 3. Check required packages, install if missing
rem    (falls back to --user install if the default location is not
rem    writable, e.g. a machine-wide Python install without admin rights)
rem ------------------------------------------------------
echo [CHECK] Verifying required packages (PyQt5, PyQtWebEngine, qrcode, Pillow)...
%PYEXE% -c "import PyQt5, PyQt5.QtWebEngineWidgets, qrcode, PIL" >nul 2>nul
if %errorlevel% neq 0 (
    echo [INSTALL] Missing packages detected, installing now ^(internet required^)...
    %PYEXE% -m pip install --upgrade pip
    %PYEXE% -m pip install PyQt5 PyQtWebEngine qrcode Pillow
    %PYEXE% -c "import PyQt5, PyQt5.QtWebEngineWidgets, qrcode, PIL" >nul 2>nul
    if !errorlevel! neq 0 (
        echo [WARN] Default install did not complete. Retrying with --user
        echo ^(installs to your personal profile, no admin rights required^)...
        %PYEXE% -m pip install --user --upgrade pip
        %PYEXE% -m pip install --user PyQt5 PyQtWebEngine qrcode Pillow
    )
    %PYEXE% -c "import PyQt5, PyQt5.QtWebEngineWidgets, qrcode, PIL" >nul 2>nul
    if !errorlevel! neq 0 (
        echo.
        echo [ERROR] Package installation failed. See the pip messages above
        echo for the exact reason ^(no internet connection, a proxy/firewall
        echo blocking PyPI, or a permissions issue are the most common causes^).
        echo You can try running manually:
        echo   %PYEXE% -m pip install --user PyQt5 PyQtWebEngine qrcode Pillow
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
