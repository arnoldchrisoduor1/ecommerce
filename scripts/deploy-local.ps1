# Interactive local deploy (Windows PowerShell).
# Builds on this machine, rsyncs to ssh host "dw-ecomm", optionally runs server script.
# No CLI flags - numbered menu; Enter selects the default.
#
#   .\scripts\deploy-local.ps1

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $RepoRoot "backend\go.mod"))) {
    throw "Run from repo (expected backend/go.mod). RepoRoot=$RepoRoot"
}
Set-Location $RepoRoot

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogDir = Join-Path $RepoRoot "deploy-logs"
$ArtifactDir = Join-Path $RepoRoot "deploy\artifacts"
$LogFile = Join-Path $LogDir "local-deploy-$Timestamp.log"
New-Item -ItemType Directory -Force -Path $LogDir, $ArtifactDir | Out-Null

$script:StartUtc = Get-Date
$script:SshHost = "dw-ecomm"
$script:RemoteRoot = "/home/ubuntu/ecommerce"
$script:ProdApiUrl = "http://backend:8080"
$script:Heartbeat = $null

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

function Write-Fail {
    param([string]$Message)
    Stop-Heartbeat
    Write-Log $Message "ERROR"
    Write-Log "See log: $LogFile" "ERROR"
    exit 1
}

function Start-Heartbeat {
    param([string]$Label, [int]$EverySec = 15)
    Stop-Heartbeat
    $script:Heartbeat = Start-Job -ScriptBlock {
        param($Label, $EverySec, $LogFile, $StartUtc)
        $n = 0
        while ($true) {
            Start-Sleep -Seconds $EverySec
            $n++
            $elapsed = [int]((Get-Date) - [datetime]$StartUtc).TotalSeconds
            $line = "[{0}] [INFO] ... still running: {1} ({2}x{3}s, total {4}s)" -f (Get-Date -Format "HH:mm:ss"), $Label, $n, $EverySec, $elapsed
            Write-Output $line
            Add-Content -Path $LogFile -Value $line
        }
    } -ArgumentList $Label, $EverySec, $LogFile, $script:StartUtc.ToString("o")
}

function Stop-Heartbeat {
    if ($script:Heartbeat) {
        Stop-Job $script:Heartbeat -ErrorAction SilentlyContinue
        Receive-Job $script:Heartbeat -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
        Remove-Job $script:Heartbeat -Force -ErrorAction SilentlyContinue
        $script:Heartbeat = $null
    }
}

function Prompt-Default {
    param([string]$PromptText, [string]$Default = "")
    if ($Default) {
        $raw = Read-Host "$PromptText [$Default]"
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        return $raw
    }
    return (Read-Host $PromptText)
}

function Confirm-Yes {
    param([string]$PromptText = "Proceed?")
    $ans = Prompt-Default $PromptText "Y"
    return ($ans -match '^(Y|y|yes|YES)$')
}

function Get-RepoWsl {
    $drive = $RepoRoot.Substring(0, 1).ToLower()
    $rest = ($RepoRoot.Substring(2) -replace "\\", "/")
    return "/mnt/$drive$rest"
}

function Invoke-WslBash {
    param([string]$BashCommand)
    $repoWsl = Get-RepoWsl
    # LF-normalize helper scripts, then run the command
    $wrapper = "find '$repoWsl/scripts' -name '*.sh' -print0 | xargs -0 sed -i 's/\r`$//'; $BashCommand"
    & wsl -e bash -lc $wrapper
    if ($LASTEXITCODE -ne 0) {
        throw "WSL command failed with exit $LASTEXITCODE"
    }
}

function Invoke-Logged {
    param(
        [string]$Label,
        [scriptblock]$Action,
        [int]$HeartbeatSec = 15
    )
    Write-Log "START: $Label"
    Start-Heartbeat -Label $Label -EverySec $HeartbeatSec
    try {
        & $Action
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
    } catch {
        Stop-Heartbeat
        Write-Fail "FAIL: $Label - $($_.Exception.Message)"
    }
    Stop-Heartbeat
    Write-Log "DONE: $Label"
}

function Build-Backend {
    Write-Log "Cross-compiling Go API for linux/amd64 (no Docker needed)..."
    $out = Join-Path $ArtifactDir "api"
    if (Test-Path $out) { Remove-Item $out -Force }

    Invoke-Logged "go build api" {
        Push-Location (Join-Path $RepoRoot "backend")
        try {
            $env:CGO_ENABLED = "0"
            $env:GOOS = "linux"
            $env:GOARCH = "amd64"
            & go build -o (Join-Path $ArtifactDir "api") .\cmd\api
            if ($LASTEXITCODE -ne 0) { throw "go build exit $LASTEXITCODE" }
        } finally {
            Pop-Location
            Remove-Item Env:CGO_ENABLED, Env:GOOS, Env:GOARCH -ErrorAction SilentlyContinue
        }
    }

    if (-not (Test-Path $out)) { Write-Fail "Missing backend binary: $out" }
    $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
    Write-Log ("Backend binary OK ({0} MB)" -f $mb)
}

function Get-NpmCmd {
    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
    if (Test-Path $fallback) { return $fallback }
    throw "npm.cmd not found (need Node.js on PATH)"
}

function Build-Frontend {
    Write-Log "Building Next.js standalone on Windows, then packaging via WSL."
    $fe = Join-Path $RepoRoot "frontend"
    $dest = Join-Path $ArtifactDir "frontend"
    $npm = Get-NpmCmd
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }

    Invoke-Logged "npm ci (if needed)" {
        Push-Location $fe
        try {
            if (-not (Test-Path "node_modules")) {
                # Use npm.cmd — npm.ps1 mangles "& npm run ..." into "pm ..."
                & $npm ci
                if ($LASTEXITCODE -ne 0) { throw "npm ci exit $LASTEXITCODE" }
            } else {
                Write-Log "node_modules present - skipping npm ci"
            }
        } finally { Pop-Location }
    } -HeartbeatSec 20

    Invoke-Logged "next build" {
        Push-Location $fe
        try {
            $env:API_URL = $script:ProdApiUrl
            & $npm run build
            if ($LASTEXITCODE -ne 0) { throw "next build exit $LASTEXITCODE" }
        } finally {
            Pop-Location
            Remove-Item Env:API_URL -ErrorAction SilentlyContinue
        }
    } -HeartbeatSec 20

    $repoWsl = Get-RepoWsl
    Invoke-Logged "package frontend (WSL)" {
        Invoke-WslBash "REPO='$repoWsl' bash '$repoWsl/scripts/lib/pack-frontend.sh'"
    }

    if (-not (Test-Path (Join-Path $dest "server.js"))) {
        Write-Fail "Frontend package missing server.js at $dest"
    }
    if (-not (Test-Path (Join-Path $ArtifactDir "frontend.tar.gz"))) {
        Write-Fail "Missing frontend.tar.gz"
    }
    Write-Log "Frontend artifact OK"
}

function Invoke-GitCommitPush {
    Write-Log "Working tree:"
    git status --short | ForEach-Object { Write-Log "  $_" }

    $msg = Prompt-Default "Commit message" "chore: deploy ecommerce"
    if (-not (Confirm-Yes "git add / commit / push?")) {
        Write-Log "Skipping git commit/push"
        return
    }

    git add -A
    foreach ($path in @(
        "deploy/artifacts",
        "deploy-logs",
        ".tmp",
        "backend/api.exe",
        "backend/api.exe~",
        ".env"
    )) {
        git reset HEAD -- $path 2>$null | Out-Null
    }

    $msgFile = Join-Path $LogDir "commit-msg-$Timestamp.txt"
    Set-Content -Path $msgFile -Value $msg -NoNewline -Encoding utf8

    git commit -F $msgFile
    if ($LASTEXITCODE -ne 0) {
        $porcelain = git status --porcelain
        if (-not $porcelain) {
            Write-Log "Nothing to commit - continuing"
        } else {
            Write-Fail "git commit failed"
        }
    } else {
        Write-Log "Commit created"
    }

    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    Invoke-Logged "git push origin $branch" {
        & git push -u origin HEAD
        if ($LASTEXITCODE -ne 0) { throw "git push exit $LASTEXITCODE" }
    }
}

function Sync-ToServer {
    if (-not (Confirm-Yes ("Rsync to {0}:{1}?" -f $script:SshHost, $script:RemoteRoot))) {
        Write-Fail "Sync declined"
    }

    $tarPath = Join-Path $ArtifactDir "frontend.tar.gz"
    $feDir = Join-Path $ArtifactDir "frontend"
    if ((Test-Path (Join-Path $feDir "server.js")) -and -not (Test-Path $tarPath)) {
        $repoWsl = Get-RepoWsl
        Invoke-Logged "tar frontend artifact" {
            Invoke-WslBash "cd '$repoWsl/deploy/artifacts'; tar -czf frontend.tar.gz frontend; ls -lh frontend.tar.gz"
        }
    }

    $repoWsl = Get-RepoWsl
    Invoke-Logged "rsync to server" {
        Invoke-WslBash "REPO='$repoWsl' REMOTE='$($script:SshHost)' DEST='$($script:RemoteRoot)' bash '$repoWsl/scripts/lib/sync-to-server.sh'"
    } -HeartbeatSec 10
}

function Invoke-RemoteDeploy {
    if (-not (Confirm-Yes "Run deploy-server.sh on server now (default menu)?")) {
        Write-Log "Skipped remote deploy. Manual: ssh dw-ecomm 'bash ~/ecommerce/scripts/deploy-server.sh'"
        return
    }
    $repoWsl = Get-RepoWsl
    Invoke-Logged "remote deploy-server.sh" {
        Invoke-WslBash "bash '$repoWsl/scripts/lib/remote-run.sh'"
    } -HeartbeatSec 20
}

# --- Menu ---
Write-Host ""
Write-Host "Ecommerce local deploy"
Write-Host "  repo: $RepoRoot"
Write-Host "  log:  $LogFile"
Write-Host ("  ssh:  {0} -> {1}" -f $script:SshHost, $script:RemoteRoot)
Write-Host ""
Write-Host "  1) Build FE+BE, commit/push, sync, run server script  [default]"
Write-Host "  2) Frontend only (build + sync)"
Write-Host "  3) Backend only (build + sync)"
Write-Host "  4) Sync existing artifacts (no rebuild)"
Write-Host "  5) Build only (no git / no sync)"
Write-Host "  6) Build FE+BE, commit/push only (no sync)"
Write-Host ""

$choice = Prompt-Default "Choice" "1"
Write-Log "Menu choice: $choice"

$doFe = $false; $doBe = $false; $doGit = $false; $doSync = $false; $doRemote = $false
switch ($choice) {
    "1" { $doFe = $true; $doBe = $true; $doGit = $true; $doSync = $true; $doRemote = $true }
    "2" { $doFe = $true; $doSync = $true }
    "3" { $doBe = $true; $doSync = $true }
    "4" { $doSync = $true }
    "5" { $doFe = $true; $doBe = $true }
    "6" { $doFe = $true; $doBe = $true; $doGit = $true }
    default { Write-Fail "Invalid choice: $choice" }
}

Write-Log "Plan fe=$doFe be=$doBe git=$doGit sync=$doSync remote=$doRemote"
if (-not (Confirm-Yes "Run this plan?")) {
    Write-Log "Aborted"
    exit 0
}

if ($doBe) { Build-Backend }
if ($doFe) { Build-Frontend }
if ($doGit) { Invoke-GitCommitPush }
if ($doSync) { Sync-ToServer }
if ($doRemote) { Invoke-RemoteDeploy }

Write-Log "ALL DONE"
Write-Host ""
Write-Host "Log: $LogFile"
