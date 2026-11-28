<#
.SYNOPSIS
  Production Database Restore for F.R.I.D.A.Y. & E.D.I.T.H.
.DESCRIPTION
  Restores database records from an export JSON backup file.
  Performs SHA-256 integrity validation and supports --dry-run validation.
.PARAMETER BackupFile
  Path to the JSON backup file to restore.
.PARAMETER DryRun
  If set, performs checksum and schema validation without mutating the database.
#>

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BackupFile,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "restore.js"

$argsList = @($BackupFile)
if ($DryRun) {
    $argsList += "--dry-run"
}

Write-Host "Starting F.R.I.D.A.Y. & E.D.I.T.H. Database Restore..." -ForegroundColor Cyan
node $nodeScript @argsList

if ($LASTEXITCODE -ne 0) {
    Write-Error "Database restore failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Database restore operation finished successfully." -ForegroundColor Green
