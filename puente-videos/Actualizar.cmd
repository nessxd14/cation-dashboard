@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0Iniciar.ps1" -Reiniciar -SinPausa
if errorlevel 1 (
  echo.
  echo No se pudo actualizar el servicio. Copia el mensaje anterior para revisar el problema.
  pause
  exit /b 1
)
