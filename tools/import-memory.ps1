param(
  [Parameter(Mandatory=$true)]
  [string]$ArchivePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ArchivePath)) {
  Write-Error "No se encontró el archivo: $ArchivePath"
  exit 1
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DbDir = Join-Path $RepoRoot "data"
$DbPath = Join-Path $DbDir "claudio.db"
$BackupDir = Join-Path $DbDir "backups"
$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $TmpDir | Out-Null

if (Test-Path $DbPath) {
  $Ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $BackupPath = Join-Path $BackupDir "claudio-backup-$Ts.db"
  Copy-Item $DbPath $BackupPath
  Write-Host "Backup creado: claudio-backup-$Ts.db"
}

Expand-Archive -Path $ArchivePath -DestinationPath $TmpDir -Force

$DbInZip = Get-ChildItem -Path $TmpDir -Filter "claudio.db" -Recurse | Select-Object -First 1

if (-not $DbInZip) {
  Write-Error "No se encontró claudio.db dentro del ZIP."
  Remove-Item -Recurse -Force $TmpDir
  exit 1
}

New-Item -ItemType Directory -Force -Path $DbDir | Out-Null
Copy-Item $DbInZip.FullName $DbPath -Force
Remove-Item -Recurse -Force $TmpDir

Write-Host "Memoria importada correctamente desde $ArchivePath"
