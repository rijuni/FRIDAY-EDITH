<#
.SYNOPSIS
  Automated Backup & Restore Verification Suite on a Disposable Test Database
.DESCRIPTION
  Performs an end-to-end rehearsal of the disaster recovery pipeline:
  1. Validates strict naming guards to protect production/development databases.
  2. Generates an isolated backup via backup-mysql.ps1 (ephemeral option file).
  3. Provisions a dedicated disposable database: friday_edith_restore_verify_test.
  4. Restores the dump via restore-mysql.ps1 using -TargetDatabase (zero passwords passed in CLI).
  5. Validates all 15 tables and performs a 1:1 row count parity check against the source database.
  6. Verifies representative records for identity, workspace, and migrations.
  7. Drops the disposable database in a guaranteed finally block.
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

$repoRoot = (Resolve-Path (Join-Path $scriptDir '..\..\..')).Path
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

if (-not $DatabaseUrl) {
  Write-Error "DATABASE_URL not found in the repository root or services/api .env file."
  exit 1
}

$uriPattern = '^mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)'
if ($DatabaseUrl -match $uriPattern) {
  $user = [System.Uri]::UnescapeDataString($matches[1])
  $password = [System.Uri]::UnescapeDataString($matches[2])
  $hostName = $matches[3]
  $port = if ($matches[4]) { $matches[4] } else { "3306" }
  $sourceDbName = $matches[5]
} else {
  Write-Error "Failed to parse DATABASE_URL components."
  exit 1
}

if ($sourceDbName -notmatch '^[A-Za-z0-9_]+$') {
  Write-Error "Source database name must contain only ASCII letters, digits, and underscores."
  exit 1
}
$systemDatabases = @('mysql', 'information_schema', 'performance_schema', 'sys')
if ($systemDatabases -contains $sourceDbName.ToLowerInvariant()) {
  Write-Error "Refusing to back up a MySQL system database."
  exit 1
}
if ($password -match '[\x00-\x1F]') {
  Write-Error "Database password contains unsupported control characters."
  exit 1
}

# Generate an unpredictable, run-specific database name. Never DROP a database
# before the test: CREATE must fail safely if a collision or pre-existing name occurs.
$TestDatabaseName = "friday_edith_restore_verify_$([System.Guid]::NewGuid().ToString('N').Substring(0, 12))_test"
if ($TestDatabaseName -eq $sourceDbName) {
  Write-Error "Disposable database name unexpectedly matches the source database."
  exit 1
}

$mysqlPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if (-not (Test-Path $mysqlPath)) {
  $cmd = Get-Command mysql -ErrorAction SilentlyContinue
  if ($cmd) { $mysqlPath = $cmd.Source }
}
if (-not $mysqlPath -or -not (Test-Path $mysqlPath)) {
  Write-Error "mysql.exe was not found in PATH or the standard MySQL installation directory."
  exit 1
}

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\')
$tempWorkDir = [System.IO.Path]::Combine($tempRoot, "friday_restore_verify_$([System.Guid]::NewGuid().ToString('N'))")
$tempConfigFile = [System.IO.Path]::Combine($tempWorkDir, 'mysql.cnf')
$tempDump = [System.IO.Path]::Combine($tempWorkDir, 'source-backup.sql')
$disposableCreated = $false

function Invoke-MySqlScalar([string]$Query) {
  $result = & $script:mysqlPath "--defaults-extra-file=$script:tempConfigFile" -N -e $Query
  if ($LASTEXITCODE -ne 0) {
    throw "A read-only MySQL verification query failed (exit code $LASTEXITCODE)."
  }
  return (($result -join "`n").Trim())
}

try {
  # Create a unique temporary directory with current-user-only ACLs before any
  # credential or database content is written into it.
  [System.IO.Directory]::CreateDirectory($tempWorkDir) | Out-Null
  $dirAcl = New-Object System.Security.AccessControl.DirectorySecurity
  $dirAcl.SetAccessRuleProtection($true, $false)
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $dirInheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $dirRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentUser,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $dirInheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $dirAcl.AddAccessRule($dirRule)
  (Get-Item -LiteralPath $tempWorkDir).SetAccessControl($dirAcl)

  # Create option file with restrictive Windows ACL permissions (current user only)
  [System.IO.File]::WriteAllText($tempConfigFile, "", [System.Text.Encoding]::ASCII)
  $acl = New-Object System.Security.AccessControl.FileSecurity
  $acl.SetAccessRuleProtection($true, $false)
  $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $currentUser,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($accessRule)
  (Get-Item $tempConfigFile).SetAccessControl($acl)

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

  Write-Host "================================================================================"
  Write-Host "  F.R.I.D.A.Y. + E.D.I.T.H. Disaster Recovery & Restore Verification Drill"
  Write-Host "================================================================================"
  Write-Host "Source Database      : $sourceDbName"
  Write-Host "Disposable Test DB   : $TestDatabaseName (Protected from production impact)"

  # Step 1: Create fresh backup to temporary file (no credentials in CLI args)
  Write-Host "`n[Step 1/5] Generating fresh database dump from source database..."
  & powershell -ExecutionPolicy Bypass -File "$scriptDir\backup-mysql.ps1" -CustomOutputFile $tempDump
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tempDump)) {
    throw "Backup creation failed during verification."
  }
  $dumpSize = (Get-Item $tempDump).Length
  Write-Host "  -> Verified backup dump exists: $([Math]::Round($dumpSize / 1024, 2)) KB"

  # Step 2: Provision disposable test database
  Write-Host "`n[Step 2/5] Provisioning disposable test database: [$TestDatabaseName]..."
  & $mysqlPath "--defaults-extra-file=$tempConfigFile" -e "CREATE DATABASE $TestDatabaseName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create disposable database $TestDatabaseName"
  }
  $disposableCreated = $true
  Write-Host "  -> Disposable database [$TestDatabaseName] provisioned cleanly."

  # Step 3: Execute restore using -TargetDatabase (NEVER pass password or DATABASE_URL on CLI)
  Write-Host "`n[Step 3/5] Restoring backup dump into disposable database (credentials via local config)..."
  & powershell -ExecutionPolicy Bypass -File "$scriptDir\restore-mysql.ps1" -BackupFile $tempDump -TargetDatabase $TestDatabaseName -ConfirmTargetDatabase $TestDatabaseName
  if ($LASTEXITCODE -ne 0) {
    throw "Restore failed on disposable database $TestDatabaseName"
  }

  # Step 4: Validate all 15 expected tables and perform 1:1 row count parity comparison
  Write-Host "`n[Step 4/5] Auditing schema tables and performing 1:1 row count parity comparison..."
  $expectedTables = @(
    "User", "Session", "AuditLog", "ProviderKey",
    "Conversation", "Message", "Attachment", "MemoryItem",
    "KnowledgeBase", "DocumentChunk", "WorkspaceProject",
    "AgentTask", "Checkpoint", "CommandApproval", "_prisma_migrations"
  )

  $tablesOutput = Invoke-MySqlScalar "SHOW TABLES FROM $TestDatabaseName;"
  $restoredTables = $tablesOutput -split '\r?\n' | Where-Object { $_.Trim() }

  if ($restoredTables.Count -ne 15) {
    throw "Table count mismatch: expected 15 tables, but found $($restoredTables.Count) tables in restored database."
  }
  Write-Host "  -> Confirmed exact expected table count: 15 tables."

  $parityFailures = [System.Collections.Generic.List[string]]::new()
  Write-Host "`n  Table Parity Audit Matrix (Source vs Restored):"
  Write-Host "  ----------------------------------------------------------------------"
  Write-Host ("  {0,-22} | {1,12} | {2,12} | {3}" -f "Table Name", "Source Rows", "Restored Rows", "Parity Status")
  Write-Host "  ----------------------------------------------------------------------"

  foreach ($tbl in $expectedTables) {
    $match = $restoredTables | Where-Object { $_ -eq $tbl -or $_.ToLower() -eq $tbl.ToLower() }
    if (-not $match) {
      throw "Missing expected table in restored database: $tbl"
    }

    $sourceCount = [int](Invoke-MySqlScalar "SELECT count(*) FROM ${sourceDbName}.${tbl};")
    $restoredCount = [int](Invoke-MySqlScalar "SELECT count(*) FROM ${TestDatabaseName}.${tbl};")

    $status = if ($sourceCount -eq $restoredCount) { "MATCH [OK]" } else { "MISMATCH [FAIL]" }
    Write-Host ("  {0,-22} | {1,12} | {2,12} | {3}" -f $tbl, $sourceCount, $restoredCount, $status)

    if ($sourceCount -ne $restoredCount) {
      $parityFailures.Add("Row count mismatch for table ${tbl}: source=${sourceCount}, restored=${restoredCount}")
    }
  }
  Write-Host "  ----------------------------------------------------------------------"

  if ($parityFailures.Count -gt 0) {
    throw "Parity audit failed: $($parityFailures -join '; ')"
  }

  # Step 4b: Verify representative records in restored database
  Write-Host "`n  Representative Records Verification:"
  $adminUser = Invoke-MySqlScalar "SELECT id FROM ${TestDatabaseName}.User WHERE role='ADMIN' LIMIT 1;"
  $devProject = Invoke-MySqlScalar "SELECT name FROM ${TestDatabaseName}.WorkspaceProject LIMIT 1;"
  $migrationRecord = Invoke-MySqlScalar "SELECT migration_name FROM ${TestDatabaseName}._prisma_migrations LIMIT 1;"

  Write-Host "    - Admin User Present      : $(if ($adminUser) { 'Verified' } else { 'Missing' })"
  Write-Host "    - Workspace Project Present : $(if ($devProject) { 'Verified' } else { 'Missing' })"
  Write-Host "    - Migration Record Present  : $(if ($migrationRecord) { 'Verified' } else { 'Missing' })"

  if (-not $adminUser -or -not $devProject -or -not $migrationRecord) {
    throw "Representative record audit failed: one or more key records were not restored."
  }

  Write-Host "`n================================================================================"
  Write-Host "  BACKUP & RESTORE ROW-COUNT CHECK: PASSED"
  Write-Host "  Row-count check passed: all 15 tables matched source row counts."
  Write-Host "  Note: row-count parity is not a byte-for-byte content comparison."
  Write-Host "================================================================================`n"
} finally {
  # Cleanup runs on normal completion and terminating errors. Forced process or
  # machine termination can still leave the ACL-restricted temp directory behind.
  Write-Host "[Cleanup] Tearing down temporary verification artifacts..."

  if ($disposableCreated) {
    try {
      & $mysqlPath "--defaults-extra-file=$tempConfigFile" -e "DROP DATABASE IF EXISTS $TestDatabaseName;"
      if ($LASTEXITCODE -ne 0) { throw "MySQL could not drop the disposable verification database." }
      Write-Host "  -> Disposable database [$TestDatabaseName] dropped cleanly."
    } catch {
      Write-Warning "Failed to drop disposable database $TestDatabaseName"
    }
  }

  if (Test-Path $tempDump) {
    Remove-Item $tempDump -Force -ErrorAction SilentlyContinue
    Write-Host "  -> Temporary backup dump file removed."
  }

  if (Test-Path $tempConfigFile) {
    try {
      [System.IO.File]::WriteAllBytes($tempConfigFile, [byte[]]::new(512))
    } catch {}
    Remove-Item -Path $tempConfigFile -Force -ErrorAction SilentlyContinue
    Write-Host "  -> Ephemeral option file zero-filled on a best-effort basis and deleted."
  }

  if (Test-Path -LiteralPath $tempWorkDir) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempWorkDir).Path
    $tempPrefix = Join-Path $tempRoot 'friday_restore_verify_'
    if (
      $resolvedTemp.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path -Leaf $resolvedTemp) -match '^friday_restore_verify_[a-f0-9]{32}$'
    ) {
      Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
      Write-Host "  -> Removed this run's restricted temporary directory."
    } else {
      Write-Warning "Temporary directory path did not pass the cleanup safety check; it was left intact: $resolvedTemp"
    }
  }
}
