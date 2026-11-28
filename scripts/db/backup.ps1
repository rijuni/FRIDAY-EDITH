<#
.SYNOPSIS
  Automated Production Database Backup for F.R.I.D.A.Y. & E.D.I.T.H.
.DESCRIPTION
  Invokes the Prisma-based canonical database backup script (scripts/db/backup.js)
  which dumps all 18 database models into a timestamped JSON file, calculates a SHA-256
  checksum, and rotates/prunes backups older than the retention threshold (14 days).
#>

param()

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "backup.js"

Write-Host "Starting F.R.I.D.A.Y. & E.D.I.T.H. Database Backup..." -ForegroundColor Cyan
node $nodeScript

if ($LASTEXITCODE -ne 0) {
    Write-Error "Database backup failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "Database backup completed successfully." -ForegroundColor Green
