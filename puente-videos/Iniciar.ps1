param([switch]$SinAbrirNavegador, [switch]$SinPausa)
$ErrorActionPreference = 'Stop'
try {
  $nodeVideos = Join-Path $PSScriptRoot 'runtime\node.exe'
  if (-not (Test-Path -LiteralPath $nodeVideos)) {
    $comandoNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $comandoNode) { throw 'Instala Node.js 22 o posterior desde https://nodejs.org o usa el paquete portatil de CATION Videos con runtime incluido.' }
    $nodeVideos = $comandoNode.Source
  }
  $versionVideos = & $nodeVideos --version
  if ($LASTEXITCODE -ne 0 -or $versionVideos -notmatch '^v(\d+)\.') { throw 'No se pudo comprobar la version de Node.js.' }
  if ([int]$Matches[1] -lt 22) { throw 'CATION Videos necesita Node.js 22 o posterior.' }
  $scriptVideos = Join-Path $PSScriptRoot 'servidor.mjs'
  if (-not (Test-Path -LiteralPath $scriptVideos)) { throw 'Extrae todo el ZIP en una carpeta antes de iniciar CATION Videos.' }
  $datosVideos = if ($env:CATION_VIDEOS_DATOS) { $env:CATION_VIDEOS_DATOS } else { Join-Path $env:LOCALAPPDATA 'CationVideos' }
  New-Item -ItemType Directory -Path $datosVideos -Force | Out-Null
  $logError = Join-Path $datosVideos 'inicio.error.log'
  $logSalida = Join-Path $datosVideos 'inicio.salida.log'
  $servicioVideos = $null
  try { $servicioVideos = Invoke-RestMethod -Uri 'http://127.0.0.1:8767/v1/identidad' -TimeoutSec 1 } catch {}
  if (-not $servicioVideos) {
    Set-Content -LiteralPath $logError -Value '' -Encoding UTF8
    Set-Content -LiteralPath $logSalida -Value '' -Encoding UTF8
    $procesoVideos = Start-Process -FilePath $nodeVideos -ArgumentList @(('"' + $scriptVideos + '"')) -WindowStyle Hidden -PassThru
    $esperaVideos = [System.Diagnostics.Stopwatch]::StartNew()
    while ($esperaVideos.Elapsed.TotalSeconds -lt 12) {
      $procesoVideos.Refresh()
      if ($procesoVideos.HasExited) { break }
      try { $servicioVideos = Invoke-RestMethod -Uri 'http://127.0.0.1:8767/v1/identidad' -TimeoutSec 1 } catch {}
      if ($servicioVideos) { break }
      Start-Sleep -Milliseconds 250
    }
    if (-not $servicioVideos) {
      $procesoVideos.Refresh()
      if (-not $procesoVideos.HasExited) { $procesoVideos.Kill() }
      $detalleVideos = if (Test-Path -LiteralPath $logError) { (Get-Content -LiteralPath $logError -Tail 15) -join [Environment]::NewLine } else { '' }
      throw "No se pudo iniciar CATION Videos. Registro: $logError$([Environment]::NewLine)$detalleVideos"
    }
  }
  if ($servicioVideos.version -ne 1 -or -not $servicioVideos.id) { throw 'Otro programa esta usando el puerto 8767. Cierra ese programa y vuelve a iniciar CATION Videos.' }
  $configArchivo = Join-Path $datosVideos 'config.json'
  if (Test-Path -LiteralPath $configArchivo) {
    $configVideos = Get-Content -LiteralPath $configArchivo -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($servicioVideos.id -ne $configVideos.id) { throw 'Hay otro equipo configurado en el puerto local. Abre http://127.0.0.1:8767 y comprueba su configuracion.' }
  }
  Write-Host 'CATION Videos listo.' -ForegroundColor Green
  Write-Host 'Configuracion: http://127.0.0.1:8767'
  Write-Host 'La primera lectura de videos grandes puede tardar.'
  if (-not $SinAbrirNavegador) { Start-Process 'http://127.0.0.1:8767' }
} catch {
  Write-Host 'No se pudo abrir CATION Videos:' -ForegroundColor Red
  Write-Host $_.Exception.Message
  if (-not $SinPausa -and -not [Console]::IsInputRedirected) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
  exit 1
}
