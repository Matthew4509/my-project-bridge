@echo off
rem Takes My Project Bridge off this PC's menus: stops it, removes the desktop shortcut, Start with Windows and the
rem Load Bridge link (this Windows user only). Then it asks (default No) whether to put the Bridge's folder, and the
rem old copies an update kept beside it, in the Recycle Bin once this window closes. Your projects are never touched.
rem About > Uninstall in the Bridge does the same.
setlocal
cd /d "%~dp0"
title My Project Bridge uninstall
echo.
echo  My Project Bridge uninstall
echo  ===========================
echo.
where node >nul 2>&1 || goto :no_node
node tools\setup.js uninstall
goto :done

:no_node
rem Without Node.js the Bridge cannot be running: take the link and both shortcuts away directly.
set "LINK_KEY=HKCU\Software\Classes\my-project-bridge"
if defined BRIDGE_LINK_KEY set "LINK_KEY=%BRIDGE_LINK_KEY%"
reg delete "%LINK_KEY%" /f >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lib\platform\windows\shortcut.ps1" -Where desktop -Action remove >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0lib\platform\windows\shortcut.ps1" -Where startup -Action remove >nul
echo  The Load Bridge link, the desktop shortcut and Start with Windows are removed,
echo  except a shortcut that starts another copy of the Bridge.
echo  My Project Bridge's files are still in "%~dp0"
echo  Delete that folder to remove it completely.

:done
echo.
if /i not "%BRIDGE_INSTALL_NO_START%"=="1" pause
exit /b 0
