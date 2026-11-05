@echo off
setlocal
powershell.exe -NoProfile -STA -File "%~dp0Configurar.ps1" -SinPausa
if errorlevel 1 (
  echo.
  echo La configuracion fallo. Copia el mensaje anterior para revisar el problema.
  pause
  exit /b 1
)
