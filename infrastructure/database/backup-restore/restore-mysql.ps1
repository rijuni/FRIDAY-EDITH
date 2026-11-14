<#
.SYNOPSIS
  Automated MySQL 8.4 database restore utility for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Restores a MySQL dump file into the target database.
#>

param (
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  Write-Error "Specified backup file does not exist: $BackupFile"
  exit 1
}

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
  Write-Error "A valid mysql:// DATABASE_URL is required to perform a restore."
  exit 1
}

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

# Locate mysql executable
$mysqlCmd = Get-Command mysql -ErrorAction SilentlyContinue
$mysql = if ($mysqlCmd) { $mysqlCmd.Source } else { $null }
if (-not $mysql) {
  $standardPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
  if (Test-Path $standardPath) {
    $mysql = $standardPath
  } else {
    Write-Error "mysql.exe not found in PATH or standard installation directory."
    exit 1
  }
}

Write-Host "🔄 Restoring database [$dbName] from $BackupFile..."

$mysqlArgs = @(
  "-h", $hostName,
  "-P", $port,
  "-u", $user,
  "--default-character-set=utf8mb4",
  $dbName
)

$env:MYSQL_PWD = $password
try {
  Get-Content -Path $BackupFile -Encoding utf8 | & $mysql @mysqlArgs
  if ($LASTEXITCODE -ne 0) {
    throw "mysql restore exited with code $LASTEXITCODE"
  }
  Write-Host "✅ Database [$dbName] restored successfully from $BackupFile"
} finally {
  $env:MYSQL_PWD = ""
}
