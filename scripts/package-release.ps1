<#
.SYNOPSIS
  Strict Security-Audited Release Packager for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Delegates to scripts/package_release.py to package clean release ZIP while strictly
  excluding secrets, .env files, node_modules, Python virtual environments, database
  backups, and .git directories, followed by an automated internal audit.
#>

param (
  [string]$OutputFile
)

$ErrorActionPreference = "Stop"
$scriptPath = Join-Path $PSScriptRoot "package_release.py"
$verifierPath = Join-Path $PSScriptRoot "verify_release_zip.py"

if ($OutputFile) {
  python $scriptPath $OutputFile
} else {
  python $scriptPath
}

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$archivePath = if ($OutputFile) {
  [System.IO.Path]::GetFullPath($OutputFile)
} else {
  Join-Path (Split-Path $PSScriptRoot -Parent) "Friday-Edith-release.zip"
}

python $verifierPath $archivePath
if ($LASTEXITCODE -ne 0) {
  Write-Error "Independent release archive verification failed."
  exit $LASTEXITCODE
}
