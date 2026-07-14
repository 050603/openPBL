$ErrorActionPreference = "Stop"

Write-Host "This permanently removes C:\code\openPBL-stable and codex/stable-v1."
Write-Host "The development system will become the only local system on port 3000."
$confirmation = Read-Host "Type DELETE OLD VERSION to continue"
if ($confirmation -cne "DELETE OLD VERSION") {
  Write-Output "Promotion cancelled."
  exit 0
}

& (Join-Path $PSScriptRoot "openpbl-versions.ps1") -Action Promote -ConfirmPromotion
