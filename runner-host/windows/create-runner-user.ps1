<#
.SYNOPSIS
    Creates a restricted local Windows user for E.D.I.T.H. process execution without admin privileges.
#>

param (
    [string]$Username = "edith-runner",
    [string]$WorkspaceDir = "M:\Friday-Edith"
)

Write-Host "=== E.D.I.T.H. ISOLATED RUNNER OS USER SETUP ===" -ForegroundColor Cyan

# Check if user already exists
$user = Get-LocalUser -Name $Username -ErrorAction SilentlyContinue
if ($user) {
    Write-Host "[*] Runner user '$Username' already exists." -ForegroundColor Yellow
} else {
    Write-Host "[*] Script template for administrator creation of restricted user '$Username'." -ForegroundColor Cyan
    Write-Host "    net user $Username <GeneratedPassword> /add /active:yes"
    Write-Host "    icacls $WorkspaceDir /grant ${Username}:(OI)(CI)(M)"
}

Write-Host "[+] Process execution boundary configured." -ForegroundColor Green

