param(
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DbPath = Join-Path $RepoRoot "data\claudio.db"

if (-not (Test-Path $DbPath)) {
  Write-Error "No se encontró la base de datos: $DbPath"
  exit 1
}

if (-not $OutputDir) { $OutputDir = $RepoRoot }

$Ts = Get-Date -Format "yyyyMMdd-HHmmss"
$ZipName = "claudio-memory-export-$Ts.zip"
$ZipPath = Join-Path $OutputDir $ZipName

$TmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Force -Path (Join-Path $TmpDir "data") | Out-Null

Copy-Item $DbPath (Join-Path $TmpDir "data\claudio.db")

$Manifest = @{
  exportedAt = (Get-Date).ToString("o")
  repo = "CLAUDIO"
  files = @("data/claudio.db")
} | ConvertTo-Json
Set-Content -Path (Join-Path $TmpDir "manifest.json") -Value $Manifest -Encoding UTF8

Compress-Archive -Path (Join-Path $TmpDir "*") -DestinationPath $ZipPath -Force
Remove-Item -Recurse -Force $TmpDir

Write-Host "Exportado: $ZipName"
