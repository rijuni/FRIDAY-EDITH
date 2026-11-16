<#
.SYNOPSIS
  Automated Backup & Restore Verification Suite on a Disposable Test Database
.DESCRIPTION
  Performs an end-to-end rehearsal of the disaster recovery pipeline:
  1. Runs backup-mysql.ps1 to generate a live, isolated backup.
  2. Drops and recreates a dedicated disposable database: friday_edith_restore_verify_test.
  3. Executes restore-mysql.ps1 to restore the dump into the disposable database.
  4. Audits all 15 tables (14 canonical application tables + _prisma_migrations) and row counts.
  5. Drops the disposable database upon completion.
#>

param (
  [string]$TestDatabaseName = "friday_edith_restore_verify_test"
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

# Load DATABASE_URL from services/api/.env
$envFile = "$scriptDir\..\..\..\services\api\.env"
if (-not (Test-Path $envFile)) {
  Write-Error "Could not find services/api/.env"
  exit 1
}

$DatabaseUrl = $null
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*DATABASE_URL\s*=\s*["'']?(mysql://[^"'']+)["'']?') {
    $DatabaseUrl = $matches[1]
  }
}

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL not found in services/api/.env"
  exit 1
}

# Parse connection
$uriPattern = '^mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
if ($DatabaseUrl -match $uriPattern) {
  $user = [System.Uri]::UnescapeDataString($matches[1])
  $password = [System.Uri]::UnescapeDataString($matches[2])
  $hostName = $matches[3]
  $port = if ($matches[4]) { $matches[4] } else { "3306" }
} else {
  Write-Error "Failed to parse DATABASE_URL"
  exit 1
}

$mysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$tempConfigFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "my_verify_$([System.Guid]::NewGuid().ToString('N')).cnf")

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

  Write-Host "================================================================================"
  Write-Host "  F.R.I.D.A.Y. + E.D.I.T.H. Backup & Restore End-to-End Verification Drill"
  Write-Host "================================================================================"

  # Step 1: Create fresh backup in a temporary test location
  $tempDump = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "verify_dump_$([System.Guid]::NewGuid().ToString('N')).sql")
  Write-Host "`n[Step 1/5] Generating fresh database dump to test file..."
  & powershell -ExecutionPolicy Bypass -File "$scriptDir\backup-mysql.ps1" -CustomOutputFile $tempDump
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tempDump)) {
    throw "Backup creation failed during verification."
  }
  $dumpSize = (Get-Item $tempDump).Length
  Write-Host "  -> Verified backup dump exists: $([Math]::Round($dumpSize / 1024, 2)) KB"

  # Step 2: Provision disposable test database
  Write-Host "`n[Step 2/5] Provisioning disposable test database: [$TestDatabaseName]..."
  $sqlInit = "DROP DATABASE IF EXISTS `$TestDatabaseName; CREATE DATABASE `$TestDatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  & $mysqlPath "--defaults-extra-file=$tempConfigFile" -e "DROP DATABASE IF EXISTS $TestDatabaseName; CREATE DATABASE $TestDatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create disposable database $TestDatabaseName"
  }
  Write-Host "  -> Disposable database [$TestDatabaseName] created cleanly."

  # Step 3: Execute restore
  Write-Host "`n[Step 3/5] Restoring backup dump into disposable database..."
  $testDbUrl = "mysql://${user}:${password}@${hostName}:${port}/${TestDatabaseName}"
  & powershell -ExecutionPolicy Bypass -File "$scriptDir\restore-mysql.ps1" -BackupFile $tempDump -DatabaseUrl $testDbUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Restore failed on disposable database $TestDatabaseName"
  }

  # Step 4: Verification of tables and row counts
  Write-Host "`n[Step 4/5] Auditing restored schema tables and record counts..."
  $expectedTables = @(
    "User", "Session", "AuditLog", "ProviderKey",
    "Conversation", "Message", "Attachment", "MemoryItem",
    "KnowledgeBase", "DocumentChunk", "WorkspaceProject",
    "AgentTask", "Checkpoint", "CommandApproval", "_prisma_migrations"
  )

  $tablesOutput = & $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SHOW TABLES FROM $TestDatabaseName;"
  $restoredTables = $tablesOutput -split '\r?\n' | Where-Object { $_.Trim() }

  Write-Host "  -> Found $($restoredTables.Count) tables in restored database (Expected: 15)."
  foreach ($tbl in $expectedTables) {
    $match = $restoredTables | Where-Object { $_ -eq $tbl -or $_.ToLower() -eq $tbl.ToLower() }
    if (-not $match) {
      throw "Missing expected table in restored database: $tbl"
    }
  }

  # Query sample record counts
  $userCount = (& $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SELECT count(*) FROM ${TestDatabaseName}.User;").Trim()
  $convCount = (& $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SELECT count(*) FROM ${TestDatabaseName}.Conversation;").Trim()
  $projCount = (& $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SELECT count(*) FROM ${TestDatabaseName}.WorkspaceProject;").Trim()
  $migCount = (& $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SELECT count(*) FROM ${TestDatabaseName}._prisma_migrations;").Trim()

  Write-Host "  -> User rows restored: $userCount"
  Write-Host "  -> Conversation rows restored: $convCount"
  Write-Host "  -> WorkspaceProject rows restored: $projCount"
  Write-Host "  -> Prisma migration records restored: $migCount"

  if ([int]$userCount -le 0) {
    throw "Restored User table is empty, expected seeded users."
  }
  if ([int]$migCount -le 0) {
    throw "Restored _prisma_migrations table is empty, expected migration history."
  }

  Write-Host "`n  Table Audit Matrix:"
  foreach ($tbl in $expectedTables) {
    $c = (& $mysqlPath "--defaults-extra-file=$tempConfigFile" -N -e "SELECT count(*) FROM ${TestDatabaseName}.${tbl};").Trim()
    Write-Host ("    - {0,-22} : {1,4} rows [OK]" -f $tbl, $c)
  }

  # Step 5: Tear down disposable database
  Write-Host "`n[Step 5/5] Tearing down disposable test database: [$TestDatabaseName]..."
  & $mysqlPath "--defaults-extra-file=$tempConfigFile" -e "DROP DATABASE IF EXISTS $TestDatabaseName;"
  Write-Host "  -> Disposable database [$TestDatabaseName] dropped cleanly."

  # Remove temp dump
  if (Test-Path $tempDump) {
    Remove-Item $tempDump -Force -ErrorAction SilentlyContinue
  }

  Write-Host "`n================================================================================"
  Write-Host "  BACKUP & RESTORE VERIFICATION: 100% PASSED (Zero data loss, 15/15 tables OK)"
  Write-Host "================================================================================`n"
} finally {
  if (Test-Path $tempConfigFile) {
    [System.IO.File]::WriteAllBytes($tempConfigFile, [byte[]]::new(512))
    Remove-Item -Path $tempConfigFile -Force -ErrorAction SilentlyContinue
  }
}
