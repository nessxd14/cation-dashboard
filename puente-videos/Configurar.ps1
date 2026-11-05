param([switch]$SinIniciar, [switch]$SinPausa)
$ErrorActionPreference = 'Stop'
try {
Add-Type -AssemblyName System.Windows.Forms
$datosVideos = Join-Path $env:LOCALAPPDATA 'CationVideos'
New-Item -ItemType Directory -Path $datosVideos -Force | Out-Null
$configArchivo = Join-Path $datosVideos 'config.json'
$config = if (Test-Path -LiteralPath $configArchivo) { Get-Content -LiteralPath $configArchivo -Raw | ConvertFrom-Json } else { $null }
$selector = New-Object System.Windows.Forms.FolderBrowserDialog
$selector.Description = 'Elige la carpeta de videos de esta PC. Sus archivos no se suben a internet.'
$selector.ShowNewFolderButton = $false
if ($config -and $config.carpeta) { $selector.SelectedPath = $config.carpeta }
if ($selector.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
$carpetaVideos = $selector.SelectedPath
$selector.Dispose()
$nombreEquipo = Read-Host "Nombre del equipo [$env:COMPUTERNAME]"
if ([string]::IsNullOrWhiteSpace($nombreEquipo)) { $nombreEquipo = $env:COMPUTERNAME }
if ($nombreEquipo.Length -gt 100) { throw 'Usa un nombre de hasta 100 caracteres.' }
$servicioActual = $null
try { $servicioActual = Invoke-RestMethod -Uri 'http://127.0.0.1:8767/v1/identidad' -TimeoutSec 2 } catch {}
if ($servicioActual) {
  if (-not $config -or $servicioActual.id -ne $config.id) { throw 'Hay otro servicio en el puerto local. Abre su configuración y comprueba el equipo antes de continuar.' }
  $paginaActual = Invoke-WebRequest -Uri 'http://127.0.0.1:8767' -UseBasicParsing -TimeoutSec 3
  if ($paginaActual.Content -notmatch 'const csrf="([a-f0-9]{64})"') { throw 'No se pudo abrir la configuración local. Actualiza CATION Videos.' }
  $csrfActual = $Matches[1]
  $cuerpoActual = @{nombre=$nombreEquipo;carpeta=$carpetaVideos} | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri 'http://127.0.0.1:8767/config' -Method Post -ContentType 'application/json; charset=utf-8' -Headers @{Origin='http://127.0.0.1:8767';'X-Cation-CSRF'=$csrfActual} -Body ([System.Text.Encoding]::UTF8.GetBytes($cuerpoActual)) | Out-Null
  Write-Host 'Carpeta actualizada en el servicio iniciado.'
  Start-Process 'http://127.0.0.1:8767'
  exit 0
}
if (-not $config) {
  $azar = New-Object byte[] 32
  $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $generador.GetBytes($azar)
  $generador.Dispose()
  $config = [pscustomobject]@{ version=1; id=[guid]::NewGuid().ToString(); nombre=$nombreEquipo; clave=([BitConverter]::ToString($azar)).Replace('-','').ToLowerInvariant(); carpeta=$carpetaVideos; dashboardOrigin='https://cation-dashboard.vercel.app' }
} else { $config.nombre=$nombreEquipo; $config.carpeta=$carpetaVideos }
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $configArchivo -Encoding UTF8
$sidVideos = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $datosVideos /inheritance:r /grant:r "*${sidVideos}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo proteger la configuración del equipo.' }
Write-Host 'Carpeta configurada:' $carpetaVideos
Write-Host 'Abre Videos locales en el Dashboard y pega el código que muestra la configuración local.'
if (-not $SinIniciar) { & (Join-Path $PSScriptRoot 'Iniciar.ps1') -SinPausa:$SinPausa }
} catch {
  Write-Host 'No se pudo configurar CATION Videos:' -ForegroundColor Red
  Write-Host $_.Exception.Message
  if (-not $SinPausa -and -not [Console]::IsInputRedirected) { Read-Host 'Pulsa Enter para cerrar' | Out-Null }
  exit 1
}
