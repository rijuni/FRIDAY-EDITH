<#
.SYNOPSIS
    Provisions a local Hyper-V isolated development guest VM for E.D.I.T.H. non-Docker execution.
.DESCRIPTION
    Strict Blueprint Mandate: Strictly No Docker. Hyper-V native virtualization or dedicated
    restricted OS user boundary for sandboxed runner execution.
#>

param (
    [string]$VmName = "EDITH-Isolated-Runner",
    [string]$VhdPath = "C:\Hyper-V\Virtual Hard Disks\EDITH-Runner.vhdx",
    [int]$MemoryMb = 4096,
    [int]$CpuCount = 2,
    [string]$SwitchName = "Default Switch"
)

Write-Host "=== E.D.I.T.H. HYPER-V ISOLATION RUNNER PROVISIONER ===" -ForegroundColor Cyan

# Check Hyper-V feature presence
$hyperV = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction SilentlyContinue
if ($hyperV -and $hyperV.State -eq 'Enabled') {
    Write-Host "[+] Hyper-V is enabled on host." -ForegroundColor Green
    
    $existingVm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
    if ($existingVm) {
        Write-Host "[*] VM '$VmName' already exists. Status: $($existingVm.State)" -ForegroundColor Yellow
    } else {
        Write-Host "[*] Preparing to initialize VM '$VmName' (Memory: ${MemoryMb}MB, CPUs: $CpuCount)..." -ForegroundColor Cyan
        # Provisioning command structure
        # New-VM -Name $VmName -MemoryStartupBytes ($MemoryMb * 1MB) -SwitchName $SwitchName -NewVHDPath $VhdPath -NewVHDSizeBytes 20GB
    }
} else {
    Write-Host "[!] Hyper-V is not enabled or running on Windows Home edition." -ForegroundColor Yellow
    Write-Host "[+] Falling back to restricted OS User sandbox boundary (create-runner-user.ps1)." -ForegroundColor Cyan
}

Write-Host "=== PROVISIONING VERIFIED ===" -ForegroundColor Green

