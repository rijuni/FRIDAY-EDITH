<#
.SYNOPSIS
  Automated MySQL 8.0 / 8.4 database backup utility for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Extracts connection parameters from DATABASE_URL or arguments and executes
  mysqldump with strict transaction isolation and utf8mb4 encoding.
#>

param (
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$BackupDir = "$PSScriptRoot\backups",
  [string]$CustomOutputFile
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
  $envFile = "$PSScriptRoot\..\..\..\services\api\.env"
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^\s*DATABASE_URL\s*=\s*["'']?(mysql://[^"'']+)["'']?') {
        $DatabaseUrl = $matches[1]
      }
    }
  }
}

if (-not $DatabaseUrl -or -not ($DatabaseUrl -match '^mysql://')) {
  Write-Error "A valid mysql:// DATABASE_URL is required to perform a backup."
  exit 1
}

# Parse mysql://user:password@host:port/database?query
$uriPattern = '^mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
if ($DatabaseUrl -match $uriPattern) {
  $user = [System.Uri]::UnescapeDataString($matches[1])
  $password = [System.Uri]::UnescapeDataString($matches[2])
  $hostName = $matches[3]
  $port = if ($matches[4]) { $matches[4] } else { "3306" }
  $dbName = $matches[5]
} else {
  Write-Error "Failed to parse DATABASE_URL components."
  exit 1
}

# Locate mysqldump executable
$dumpCmd = Get-Command mysqldump -ErrorAction SilentlyContinue
$mysqldump = if ($dumpCmd) { $dumpCmd.Source } else { $null }
if (-not $mysqldump) {
  $standardPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
  if (Test-Path $standardPath) {
    $mysqldump = $standardPath
  } else {
    Write-Error "mysqldump.exe not found in PATH or standard installation directory."
    exit 1
  }
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$targetFile = if ($CustomOutputFile) { $CustomOutputFile } else { "$BackupDir\${dbName}_backup_$timestamp.sql" }

Write-Host "📦 Starting MySQL backup for database [$dbName] at ${hostName}:${port}..."

$dumpArgs = @(
  "-h", $hostName,
  "-P", $port,
  "-u", $user,
  "--no-tablespaces",
  "--single-transaction",
  "--routines",
  "--triggers",
  "--default-character-set=utf8mb4",
  $dbName
)

$env:MYSQL_PWD = $password
try {
  & $mysqldump @dumpArgs | Out-File -FilePath $targetFile -Encoding utf8
  if ($LASTEXITCODE -ne 0) {
    throw "mysqldump exited with code $LASTEXITCODE"
  }
  $sizeBytes = (Get-Item $targetFile).Length
  $sizeKb = [Math]::Round($sizeBytes / 1024, 2)
  Write-Host "✅ Backup completed successfully: $targetFile ($sizeKb KB)"
} finally {
  $env:MYSQL_PWD = ""
}
