<#
.SYNOPSIS
  Secure MySQL 8.0 / 8.4 database restore utility for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Restores a MySQL dump file into the target database using an ephemeral option
  file (--defaults-extra-file) protected by restrictive Windows ACL permissions.
  Avoids exposing credentials in process tables, environment variables (MYSQL_PWD),
  logs, or child-process command-line arguments. Streams data directly via native
  process StandardInput BaseStream to prevent PowerShell pipeline encoding mangling.
#>

param (
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$TargetDatabase,
  [Parameter(Mandatory = $true)]
  [string]$ConfirmTargetDatabase
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
  Write-Error "Specified backup file does not exist: $BackupFile"
  exit 1
}

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
  Write-Error "A valid mysql:// DATABASE_URL or configured .env file is required to perform a restore."
  exit 1
}

# Parse mysql://user:password@host:port/database?query
$uriPattern = '^mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
if ($DatabaseUrl -match $uriPattern) {
  $user = [System.Uri]::UnescapeDataString($matches[1])
  $password = [System.Uri]::UnescapeDataString($matches[2])
  $hostName = $matches[3]
  $port = if ($matches[4]) { $matches[4] } else { "3306" }
  $dbName = if ($TargetDatabase) { $TargetDatabase } else { $matches[5] }
} else {
  Write-Error "Failed to parse database connection parameters."
  exit 1
}

if ($dbName -notmatch '^[A-Za-z0-9_]+$') {
  Write-Error "Target database name must contain only ASCII letters, digits, and underscores."
  exit 1
}
if ($ConfirmTargetDatabase -cne $dbName) {
  Write-Error "Restore confirmation must exactly match the target database name [$dbName]. No restore was performed."
  exit 1
}
if ($password -match '[\x00-\x1F]') {
  Write-Error "Database password contains unsupported control characters."
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

# Security: Create ephemeral client option file with restrictive Windows ACL permissions.
$tempConfigFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "my_restore_$([System.Guid]::NewGuid().ToString('N')).cnf")

try {
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

  Write-Host "Restoring into explicitly confirmed database [$dbName] from $BackupFile..."

  # Stream dump directly into mysql process StandardInput BaseStream (native binary stream)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $mysql
  $psi.Arguments = "--defaults-extra-file=`"$tempConfigFile`" --default-character-set=utf8mb4 `"$dbName`""
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::Start($psi)
  $stdErrTask = $process.StandardError.ReadToEndAsync()

  try {
    $fileStream = [System.IO.File]::OpenRead($BackupFile)
    try {
      $fileStream.CopyTo($process.StandardInput.BaseStream)
    } finally {
      $fileStream.Dispose()
    }
    $process.StandardInput.BaseStream.Flush()
    $process.StandardInput.Close()
    $process.WaitForExit()
    $stdErr = $stdErrTask.GetAwaiter().GetResult()

    if ($process.ExitCode -ne 0) {
      throw "mysql restore exited with error code $($process.ExitCode): $stdErr"
    }
  } catch {
    if (-not $process.HasExited) {
      try { $process.Kill() } catch {}
    }
    throw
  } finally {
    $process.Dispose()
  }

  Write-Host "Database [$dbName] restored successfully from $BackupFile"
} finally {
  # Best-effort zero-fill before deletion; this is not a guaranteed secure erase.
  if (Test-Path $tempConfigFile) {
    try {
      [System.IO.File]::WriteAllBytes($tempConfigFile, [byte[]]::new(512))
    } catch {}
    Remove-Item -Path $tempConfigFile -Force -ErrorAction SilentlyContinue
  }
}
