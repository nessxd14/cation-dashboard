$ErrorActionPreference = 'Stop'
$nodeVideos = Join-Path $PSScriptRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodeVideos)) {
  $comandoNode = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $comandoNode) { throw 'Instala Node.js 22 o posterior desde https://nodejs.org o usa el paquete portátil de CATION Videos con runtime incluido.' }
  $nodeVideos = $comandoNode.Source
}
$versionVideos = & $nodeVideos -p 'process.versions.node.split(".")[0]'
if ([int]$versionVideos -lt 22) { throw 'CATION Videos necesita Node.js 22 o posterior.' }
$scriptVideos = Join-Path $PSScriptRoot 'servidor.mjs'
Start-Process -FilePath $nodeVideos -ArgumentList @(('"' + $scriptVideos + '"')) -WindowStyle Hidden
Write-Host 'CATION Videos iniciado. La primera lectura de videos grandes puede tardar.'
Write-Host 'Configuración: http://127.0.0.1:8767'
Start-Process 'http://127.0.0.1:8767'
