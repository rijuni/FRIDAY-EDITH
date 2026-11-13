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
if (-not $hyperV -or $hyperV.State -ne 'Enabled') {
    throw 'Hyper-V is unavailable. No restricted-user fallback is provisioned by this script.'
}

$existingVm = Get-VM -Name $VmName -ErrorAction SilentlyContinue
if ($existingVm) {
    Write-Host "VM '$VmName' exists with status '$($existingVm.State)', but this script does not verify its guest image, networking, limits, or runner service." -ForegroundColor Yellow
} else {
    Write-Host "A VM was not created. A bootable guest image and configured guest runner are required before provisioning can be implemented." -ForegroundColor Yellow
}

throw 'Runner isolation is not provisioned or verified. Arbitrary code execution must remain disabled.'

