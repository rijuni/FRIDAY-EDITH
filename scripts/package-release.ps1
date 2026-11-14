<#
.SYNOPSIS
  Secure project release packager for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Creates a clean ZIP distribution archive while strictly excluding all secrets,
  local .env files, node_modules, Python virtual environments, and temporary directories.
#>

param (
  [string]$OutputFile = "$PSScriptRoot\..\friday-edith-clean.zip"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host "📦 Packaging clean project release from $repoRoot..."

if (Test-Path $OutputFile) {
  Remove-Item $OutputFile -Force
}

$excludePatterns = @(
  '\\\.git(\\|$)',
  '\\node_modules(\\|$)',
  '\\\.venv(\\|$)',
  '\\venv(\\|$)',
  '\\__pycache__(\\|$)',
  '\\dist(\\|$)',
  '\\\.tmp(\\|$)',
  '\\backups(\\|$)',
  '\\\.env(\.|$)',
  '\.db(-journal|-wal|-shm)?$',
  '\.sqlite(3)?$'
)

$filesToZip = Get-ChildItem -Path $repoRoot -Recurse -File | Where-Object {
  $rel = $_.FullName.Substring($repoRoot.Length)
  $exclude = $false
  foreach ($pattern in $excludePatterns) {
    if ($rel -match $pattern) {
      $exclude = $true
      break
    }
  }
  # Keep .env.example
  if ($_.Name -eq '.env.example') {
    $exclude = $false
  }
  -not $exclude
}

Write-Host "Filtered $($filesToZip.Count) safe files for archive. Compressing..."

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipArchive = [System.IO.Compression.ZipFile]::Open($OutputFile, [System.IO.Compression.ZipArchiveMode]::Create)

try {
  foreach ($file in $filesToZip) {
    $entryName = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipArchive, $file.FullName, $entryName) | Out-Null
  }
  Write-Host "✅ Clean release package created at: $OutputFile"
} finally {
  $zipArchive.Dispose()
}
