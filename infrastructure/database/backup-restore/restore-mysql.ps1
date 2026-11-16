<#
.SYNOPSIS
  Secure MySQL 8.0 / 8.4 database restore utility for F.R.I.D.A.Y. + E.D.I.T.H.
.DESCRIPTION
  Restores a MySQL dump file into the target database using an ephemeral option
  file (--defaults-extra-file) to avoid exposing credentials in process tables or
  environment variables. Streams the file directly via native ProcessStartInfo BaseStream
  to prevent cmd.exe quoting quirks and PowerShell pipeline encoding alterations.
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

# Security: Create ephemeral client option file with strict credentials.
$tempConfigFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "my_restore_$([System.Guid]::NewGuid().ToString('N')).cnf")

$configContent = @"
[client]
user=$user
password="$password"
host=$hostName
port=$port
default-character-set=utf8mb4
"@

try {
  [System.IO.File]::WriteAllText($tempConfigFile, $configContent, [System.Text.Encoding]::ASCII)

  Write-Host "🔄 Restoring database [$dbName] from $BackupFile..."

  # Stream dump directly into mysql process StandardInput BaseStream (native binary stream)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $mysql
  $psi.Arguments = "--defaults-extra-file=`"$tempConfigFile`" --default-character-set=utf8mb4 $dbName"
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardError = $true
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::Start($psi)
  
  # Stream file bytes directly without loading everything into huge string memory
  $fileStream = [System.IO.File]::OpenRead($BackupFile)
  $fileStream.CopyTo($process.StandardInput.BaseStream)
  $fileStream.Close()
  $process.StandardInput.BaseStream.Flush()
  $process.StandardInput.Close()

  $process.WaitForExit()
  $stdErr = $process.StandardError.ReadToEnd()

  if ($process.ExitCode -ne 0) {
    throw "mysql restore exited with error code $($process.ExitCode): $stdErr"
  }

  Write-Host "✅ Database [$dbName] restored successfully from $BackupFile"
} finally {
  # Security: Overwrite sensitive memory/disk bytes before deletion
  if (Test-Path $tempConfigFile) {
    [System.IO.File]::WriteAllBytes($tempConfigFile, [byte[]]::new(512))
    Remove-Item -Path $tempConfigFile -Force -ErrorAction SilentlyContinue
  }
}
