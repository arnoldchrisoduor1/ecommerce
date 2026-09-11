# Thin Windows wrapper for ./deploy.sh in WSL.
#   .\scripts\deploy-local.ps1
#   .\scripts\deploy-local.ps1 6
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$argStr = if ($args.Count -gt 0) { $args -join " " } else { "" }
Write-Host "Launching WSL ./deploy.sh $argStr"
$cmd = @"
cd /mnt/c/dev/ecommerce
sed -i 's/\r`$//' deploy.sh scripts/lib/*.sh scripts/deploy-server.sh 2>/dev/null || true
chmod +x deploy.sh scripts/lib/*.sh
./deploy.sh $argStr
"@
wsl -e bash -lc $cmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
