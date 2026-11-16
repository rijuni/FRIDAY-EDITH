<#
.SYNOPSIS
  Secure MySQL 8.0 / 8.4 database backup utility for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Extracts connection parameters from local configuration and executes mysqldump
  using a secure ephemeral option file (--defaults-extra-file) protected by restrictive
  Windows ACL permissions. Avoids exposing credentials in process tables, environment
  variables (MYSQL_PWD), logs, or command-line arguments. Writes backup directly using
  native mysqldump --result-file to guarantee safe UTF-8 encoding.
#>

param (
  [string]$SourceDatabase,
  [string]$BackupDir = "$PSScriptRoot\backups",
  [string]$CustomOutputFile
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$envFiles = @(
  (Join-Path $repoRoot '.env'),
  (Join-Path $repoRoot 'services\api\.env')
)
$DatabaseUrl = $null
foreach ($envFile in $envFiles) {
  if (-not (Test-Path -LiteralPath $envFile)) { continue }
  foreach ($line in Get-Content -LiteralPath $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*["'']?(mysql://[^"'']+)["'']?') {
      $DatabaseUrl = $matches[1]
      break
    }
  }
  if ($DatabaseUrl) { break }
}

if (-not $DatabaseUrl -or -not ($DatabaseUrl -match '^mysql://')) {
  Write-Error "A valid mysql:// DATABASE_URL or configured .env file is required to perform a backup."
  exit 1
}

# Parse mysql://user:password@host:port/database?query
$uriPattern = '^mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
if ($DatabaseUrl -match $uriPattern) {
  $user = [System.Uri]::UnescapeDataString($matches[1])
  $password = [System.Uri]::UnescapeDataString($matches[2])
  $hostName = $matches[3]
  $port = if ($matches[4]) { $matches[4] } else { "3306" }
  $dbName = if ($SourceDatabase) { $SourceDatabase } else { $matches[5] }
} else {
  Write-Error "Failed to parse database connection parameters."
  exit 1
}

if ($dbName -notmatch '^[A-Za-z0-9_]+$') {
  Write-Error "Database name must contain only ASCII letters, digits, and underscores."
  exit 1
}
if ($password -match '[\x00-\x1F]') {
  Write-Error "Database password contains unsupported control characters."
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
# Security: Create ephemeral client option file with restrictive Windows ACL permissions.
$tempConfigFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "my_backup_$([System.Guid]::NewGuid().ToString('N')).cnf")
$backupSucceeded = $false

try {
  # Create an empty output and lock its ACL before mysqldump writes database contents.
  $backupOutputStream = [System.IO.File]::Open(
    $targetFile,
    [System.IO.FileMode]::CreateNew,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::None
  )
  $backupOutputStream.Dispose()
  $backupAcl = New-Object System.Security.AccessControl.FileSecurity
  $backupAcl.SetAccessRuleProtection($true, $false)
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $backupRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentUser,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $backupAcl.AddAccessRule($backupRule)
  (Get-Item -LiteralPath $targetFile).SetAccessControl($backupAcl)

  # 1. Create empty file
  [System.IO.File]::WriteAllText($tempConfigFile, "", [System.Text.Encoding]::ASCII)

  # 2. Apply restrictive Windows ACL (only current user has access, inheritance removed)
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentUser,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($accessRule)
  (Get-Item $tempConfigFile).SetAccessControl($acl)

  # 3. Write option file credentials
  $escapedPassword = $password.Replace('\', '\\').Replace('"', '\"')
  $configContent = @"
[client]
user=$user
password="$escapedPassword"
host=$hostName
port=$port
default-character-set=utf8mb4
"@
  [System.IO.File]::WriteAllText($tempConfigFile, $configContent, [System.Text.Encoding]::ASCII)

  Write-Host "Starting MySQL backup for database [$dbName] at ${hostName}:${port}..."

  $dumpArgs = @(
    "--defaults-extra-file=$tempConfigFile",
    "--no-tablespaces",
    "--single-transaction",
    "--routines",
    "--triggers",
    "--default-character-set=utf8mb4",
    "--result-file=$targetFile",
    $dbName
  )

  & $mysqldump @dumpArgs
  if ($LASTEXITCODE -ne 0) {
    throw "mysqldump exited with error code $LASTEXITCODE"
  }

  $sizeBytes = (Get-Item $targetFile).Length
  $sizeKb = [Math]::Round($sizeBytes / 1024, 2)
  $backupSucceeded = $true
  Write-Host "Backup completed successfully: $targetFile ($sizeKb KB)"
} finally {
  if (-not $backupSucceeded -and (Test-Path -LiteralPath $targetFile)) {
    Remove-Item -LiteralPath $targetFile -Force -ErrorAction SilentlyContinue
  }
  # Best-effort zero-fill before deletion; this is not a guaranteed secure erase.
  if (Test-Path $tempConfigFile) {
    try {
      [System.IO.File]::WriteAllBytes($tempConfigFile, [byte[]]::new(512))
    } catch {}
    Remove-Item -Path $tempConfigFile -Force -ErrorAction SilentlyContinue
  }
}
