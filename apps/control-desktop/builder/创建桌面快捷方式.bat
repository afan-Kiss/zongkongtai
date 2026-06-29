@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set "TARGET=%~dp0珠宝本地总控工作台.exe"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\珠宝本地总控工作台.lnk"

if not exist "%TARGET%" (
  echo 找不到 EXE：%TARGET%
  echo 请将此 bat 放在与 珠宝本地总控工作台.exe 同一目录。
  pause
  exit /b 1
)

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%SHORTCUT%'); ^
   $s.TargetPath = '%TARGET%'; ^
   $s.WorkingDirectory = '%~dp0'; ^
   $s.Description = '珠宝本地总控工作台'; ^
   $s.Save()"

if errorlevel 1 (
  echo 创建快捷方式失败
  pause
  exit /b 1
)

echo 已创建桌面快捷方式：%SHORTCUT%
pause
