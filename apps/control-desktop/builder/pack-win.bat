@echo off
setlocal
cd /d "%~dp0.."
call npm run build
if errorlevel 1 exit /b 1
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win dir
if errorlevel 1 exit /b 1
set OUT=dist-desktop\珠宝本地总控工作台
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%OUT%"
xcopy /E /I /Y "dist-desktop\win-unpacked\*" "%OUT%\"
copy /Y "builder\启动珠宝本地总控工作台.bat" "%OUT%\"
copy /Y "builder\创建桌面快捷方式.bat" "%OUT%\"
copy /Y "builder\启动珠宝本地总控工作台.bat" "dist-desktop\win-unpacked\"
copy /Y "builder\创建桌面快捷方式.bat" "dist-desktop\win-unpacked\"
echo.
echo Build complete: %OUT%\珠宝本地总控工作台.exe
exit /b 0
