<#
.SYNOPSIS
    Creates a restricted local Windows user for E.D.I.T.H. process execution without admin privileges.
#>

param (
    [string]$Username = "edith-runner",
    [string]$WorkspaceDir = "M:\Friday-Edith"
)

Write-Host "=== E.D.I.T.H. ISOLATED RUNNER OS USER SETUP ===" -ForegroundColor Cyan

# This script intentionally does not create an account or grant ACLs: those
# steps require a managed password and an explicit, reviewed permissions plan.
$user = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
if ($user) {
    Write-Host "User '$Username' exists, but this script has not verified its group membership, logon rights, token privileges, or workspace ACLs." -ForegroundColor Yellow
} else {
    Write-Host "User '$Username' was not created. Workspace target: $WorkspaceDir" -ForegroundColor Yellow
}

throw 'A restricted OS execution boundary is not configured or verified. Arbitrary code execution must remain disabled.'

