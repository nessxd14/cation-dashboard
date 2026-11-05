@echo off
setlocal
powershell.exe -NoProfile -STA -File "%~dp0Iniciar.ps1" -SinPausa
if errorlevel 1 (
  echo.
  echo El inicio fallo. El mensaje anterior indica que falta o que error ocurrio.
  pause
  exit /b 1
)
