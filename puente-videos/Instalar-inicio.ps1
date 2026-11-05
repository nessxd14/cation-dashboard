$ErrorActionPreference = 'Stop'
$nodeVideos = Join-Path $PSScriptRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodeVideos)) { $comandoNode=Get-Command node.exe -ErrorAction Stop; $nodeVideos=$comandoNode.Source }
$archivoVideos = Join-Path $PSScriptRoot 'servidor.mjs'
$lanzadorVideos = Join-Path $PSScriptRoot 'iniciar-oculto.vbs'
$lineaVideos = 'CreateObject("WScript.Shell").Run """' + $nodeVideos.Replace('"','""') + '"" ""' + $archivoVideos.Replace('"','""') + '""", 0, False'
$lineaVideos | Set-Content -LiteralPath $lanzadorVideos -Encoding Unicode
$inicioVideos = [Environment]::GetFolderPath('Startup')
$shellVideos = New-Object -ComObject WScript.Shell
$accesoVideos = $shellVideos.CreateShortcut((Join-Path $inicioVideos 'CATION Videos.lnk'))
$accesoVideos.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$accesoVideos.Arguments = '"' + $lanzadorVideos + '"'
$accesoVideos.WorkingDirectory = $PSScriptRoot
$accesoVideos.WindowStyle = 7
$accesoVideos.Description = 'Videos locales de CATION; solo escucha en esta PC.'
$accesoVideos.Save()
Write-Host 'CATION Videos se iniciará al entrar en Windows con esta cuenta.'
Write-Host 'Conserva esta carpeta. Para desactivar el inicio automático, elimina el acceso CATION Videos de la carpeta Inicio de Windows.'
