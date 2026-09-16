param([string]$InstallDir = 'C:\Program Files\NetEase\CloudMusic')
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$installRoot = [IO.Path]::GetFullPath($InstallDir)
if (!(Test-Path -LiteralPath (Join-Path $installRoot 'cloudmusic.exe'))) {
    throw "Not a CloudMusic installation: $installRoot"
}
if (Get-Process -Name cloudmusic -ErrorAction SilentlyContinue) {
    throw 'Please exit CloudMusic before installing. No files have been changed.'
}
$buildRoot = Join-Path $projectDir 'build'
$manifest = Get-Content -LiteralPath (Join-Path $buildRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$files = @($manifest.files | ForEach-Object { $_.path })
foreach ($entry in $manifest.files) {
    $source = [IO.Path]::GetFullPath((Join-Path $buildRoot $entry.path))
    $target = [IO.Path]::GetFullPath((Join-Path $installRoot $entry.path))
    if (!$source.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
        !$target.StartsWith($installRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Invalid release path: $($entry.path)"
    }
    if ((Get-FileHash -LiteralPath $source).Hash -ne $entry.sha256) {
        throw "Build artifact checksum mismatch: $($entry.path). Rebuild Release x64 first."
    }
}
$backupRoot = Join-Path $projectDir ('out\deployment-backups\install-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$records = @()
foreach ($relative in $files) {
    $target = Join-Path $installRoot $relative
    $backup = Join-Path $backupRoot $relative
    $existed = Test-Path -LiteralPath $target -PathType Leaf
    if ($existed) {
        New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $target -Destination $backup
    }
    $records += [pscustomobject]@{ Relative = $relative; Target = $target; Backup = $backup; Existed = $existed }
}
try {
    foreach ($record in $records) {
        New-Item -ItemType Directory -Path (Split-Path $record.Target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $buildRoot $record.Relative) -Destination $record.Target -Force
    }
} catch {
    foreach ($record in $records) {
        if ($record.Existed) { Copy-Item -LiteralPath $record.Backup -Destination $record.Target -Force }
        elseif (Test-Path -LiteralPath $record.Target -PathType Leaf) { Remove-Item -LiteralPath $record.Target }
    }
    throw
}
Write-Output "Installed: $installRoot"
Write-Output "Backup: $backupRoot"
Write-Output 'Start CloudMusic and open E > interface mode to choose a theme.'
