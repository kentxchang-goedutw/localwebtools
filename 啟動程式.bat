@echo off
setlocal enabledelayedexpansion
title WEB Classroom Tool - Launcher
cd /d "%~dp0"

echo ============================================
echo   WEB Classroom Interactive Tool - Startup
echo ============================================
echo.

rem ------------------------------------------------------
rem 1. Locate a REAL, usable Python (prefer the py launcher).
rem     Windows ships a fake "python.exe" / "python3.exe" app-execution
rem     alias even when NO Python is installed at all - "where" finds
rem     it and it even "runs", but it produces no real output (its only
rem     job is to pop up the Microsoft Store). So every candidate found
rem     is verified by actually executing a command through it before
rem     it gets accepted.
rem ------------------------------------------------------
set "PYEXE="

where py >nul 2>nul
if %errorlevel% equ 0 (
    set "PROBE="
    for /f "delims=" %%P in ('py -c "print(1)" 2^>nul') do set "PROBE=%%P"
    if "!PROBE!"=="1" set "PYEXE=py"
)

if "!PYEXE!"=="" (
    where python >nul 2>nul
    if !errorlevel! equ 0 (
        set "PROBE="
        for /f "delims=" %%P in ('python -c "print(1)" 2^>nul') do set "PROBE=%%P"
        if "!PROBE!"=="1" set "PYEXE=python"
    )
)

rem ------------------------------------------------------
rem 1b. Reject the Microsoft Store "python.exe" / "python3.exe" app
rem     execution alias even when it IS a real, working interpreter
rem     (i.e. it passed the probe above). It reports a real version
rem     number and looks fine, but it runs in a sandbox that blocks
rem     pip/ensurepip from writing packages, so treat it the same as
rem     "Python not found" and install the real thing instead.
rem ------------------------------------------------------
set "RESOLVED_PY="
if not "!PYEXE!"=="" (
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

rem ------------------------------------------------------
rem 1c. No usable Python found - install one automatically.
rem     Tries winget first; if winget is unavailable or fails (older
rem     Windows without App Installer, or a blocked winget source),
rem     falls back to downloading the official python.org installer
rem     directly and running it silently (per-user, no admin needed).
rem ------------------------------------------------------
if "!PYEXE!"=="" (
    echo [INFO] No working Python installation found. Attempting automatic install...
    echo.
    set "INSTALL_OK=0"

    where winget >nul 2>nul
    if !errorlevel! equ 0 (
        echo Installing Python via winget, please wait ^(internet required^)...
        winget install -e --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        if !errorlevel! equ 0 set "INSTALL_OK=1"
    ) else (
        echo [INFO] winget is not available on this PC.
    )

    if "!INSTALL_OK!"=="0" (
        echo [INFO] Trying a direct download of the official Python installer
        echo from python.org instead ^(internet required^)...
        set "PYSETUP=%TEMP%\python-installer.exe"
        if exist "!PYSETUP!" del /f /q "!PYSETUP!" >nul 2>nul
        where curl >nul 2>nul
        if !errorlevel! equ 0 (
            curl -sSL -o "!PYSETUP!" https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
        ) else (
            powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe' -OutFile '!PYSETUP!' } catch { exit 1 }"
        )
        if exist "!PYSETUP!" (
            echo Installing Python ^(per-user install, no admin rights required^)...
            "!PYSETUP!" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_pip=1 Include_test=0
            if !errorlevel! equ 0 set "INSTALL_OK=1"
            del /f /q "!PYSETUP!" >nul 2>nul
        ) else (
            echo [INFO] Direct download failed too ^(network/firewall likely
            echo blocking python.org^).
        )
    )

    if "!INSTALL_OK!"=="0" (
        echo.
        echo [ERROR] Automatic Python install failed ^(tried both winget and
        echo a direct download^). Please install manually from:
        echo https://www.python.org/downloads/
        echo IMPORTANT: check "Add python.exe to PATH" and "pip" during
        echo install, then run this launcher again.
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
    echo [ERROR] Could not install pip on this Python installation.
    if defined RESOLVED_PY echo   ^(!RESOLVED_PY!^)
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
