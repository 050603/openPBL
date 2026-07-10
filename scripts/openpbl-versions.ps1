param(
  [ValidateSet("Start", "Stop", "Status", "Promote")]
  [string]$Action = "Status",
  [switch]$ConfirmPromotion
)

$ErrorActionPreference = "Stop"

# OPENPBL_LEGACY_BOUNDARY: The stable application exists only in the sibling
# git worktree. Keep legacy code out of the development tree so promotion can
# remove it atomically without source-file archaeology.
$DevRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$WorkspaceParent = Split-Path -Parent $DevRoot
$StableRoot = Join-Path $WorkspaceParent "openPBL-stable"
$RuntimeRoot = Join-Path $DevRoot ".openpbl-runtime"

function Get-ProcessState([string]$Name) {
  $pidFile = Join-Path $RuntimeRoot "$Name.pid"
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return $null
  }

  $processId = [int](Get-Content -LiteralPath $pidFile -Raw)
  return Get-Process -Id $processId -ErrorAction SilentlyContinue
}

function Start-OpenPbl([string]$Name, [string]$Root, [int]$Port) {
  if (Get-ProcessState $Name) {
    Write-Output "$Name is already running on http://localhost:$Port"
    return
  }
  if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "$Name worktree is missing: $Root"
  }

  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  $stdout = Join-Path $RuntimeRoot "$Name.out.log"
  $stderr = Join-Path $RuntimeRoot "$Name.err.log"
  $process = Start-Process -FilePath "pnpm.cmd" `
    -ArgumentList @("exec", "next", "dev", "-p", "$Port") `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -PassThru
  Set-Content -LiteralPath (Join-Path $RuntimeRoot "$Name.pid") -Value $process.Id
  Write-Output "$Name started on http://localhost:$Port (PID $($process.Id))"
}

function Stop-OpenPbl([string]$Name) {
  $pidFile = Join-Path $RuntimeRoot "$Name.pid"
  $process = Get-ProcessState $Name
  if ($process) {
    Stop-Process -Id $process.Id -Force
    Write-Output "$Name stopped (PID $($process.Id))"
  } else {
    Write-Output "$Name is not running"
  }
  if (Test-Path -LiteralPath $pidFile) {
    Remove-Item -LiteralPath $pidFile -Force
  }
}

function Show-Status {
  $stable = Get-ProcessState "stable"
  $development = Get-ProcessState "development"
  $promoted = Test-Path -LiteralPath (Join-Path $RuntimeRoot "promoted")
  $developmentPort = if ($promoted) { 3000 } else { 3100 }
  Write-Output ("stable     {0}  http://localhost:3000  {1}" -f $(if ($stable) { "running" } else { "stopped" }), $StableRoot)
  Write-Output ("development {0}  http://localhost:{1}  {2}" -f $(if ($development) { "running" } else { "stopped" }), $developmentPort, $DevRoot)
}

function Promote-Development {
  if (-not $ConfirmPromotion) {
    throw "Promotion requires -ConfirmPromotion because it permanently removes the stable worktree and branch."
  }
  if (-not (Test-Path -LiteralPath $StableRoot -PathType Container)) {
    throw "Stable worktree does not exist: $StableRoot"
  }

  $resolvedStable = (Resolve-Path -LiteralPath $StableRoot).Path
  $expectedStable = [System.IO.Path]::GetFullPath($StableRoot).TrimEnd('\')
  if ($resolvedStable.TrimEnd('\') -ne $expectedStable -or (Split-Path -Parent $resolvedStable) -ne $WorkspaceParent) {
    throw "Refusing to remove an unexpected path: $resolvedStable"
  }

  $worktrees = (& git -C $DevRoot worktree list --porcelain) -join "`n"
  if ($worktrees -notmatch [regex]::Escape("worktree $($resolvedStable.Replace('\', '/'))")) {
    throw "The stable path is not a registered git worktree: $resolvedStable"
  }

  Write-Output "Running development verification before removing the stable system..."
  & pnpm.cmd --dir $DevRoot test
  if ($LASTEXITCODE -ne 0) { throw "Tests failed; the stable system was not removed." }
  & pnpm.cmd --dir $DevRoot build
  if ($LASTEXITCODE -ne 0) { throw "Build failed; the stable system was not removed." }

  Stop-OpenPbl "stable"
  Stop-OpenPbl "development"
  & git -C $DevRoot worktree remove --force $resolvedStable
  if ($LASTEXITCODE -ne 0) { throw "Could not remove the stable worktree." }
  & git -C $DevRoot branch -D codex/stable-v1
  if ($LASTEXITCODE -ne 0) { throw "Could not remove the stable branch." }
  New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $RuntimeRoot "promoted") -Value (Get-Date).ToString("o")
  Start-OpenPbl "development" $DevRoot 3000
  Write-Output "Development is now the only local system and is running on http://localhost:3000"
}

switch ($Action) {
  "Start" {
    Start-OpenPbl "stable" $StableRoot 3000
    Start-OpenPbl "development" $DevRoot 3100
    Show-Status
  }
  "Stop" {
    Stop-OpenPbl "stable"
    Stop-OpenPbl "development"
  }
  "Status" { Show-Status }
  "Promote" { Promote-Development }
}
