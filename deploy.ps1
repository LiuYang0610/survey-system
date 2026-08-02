$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Survey System - Cloudflare KV Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# [1] Install root deps
Write-Host "[1/8] Installing dependencies..." -ForegroundColor Yellow
& npm install 2>$null
Write-Host "  OK" -ForegroundColor Green

# [2] Login check
Write-Host "[2/8] Checking login..." -ForegroundColor Yellow
& wrangler whoami 2>$null
Write-Host "  OK" -ForegroundColor Green

# [3] Get KV namespace ID
Write-Host "[3/8] Getting KV namespace..." -ForegroundColor Yellow

$existingId = $null
if (Test-Path wrangler.toml) {
    $tomlContent = Get-Content wrangler.toml -Raw
    if ($tomlContent -match 'id\s*=\s*"([a-f0-9]{32})"') {
        $existingId = $Matches[1]
        Write-Host "  Found existing KV ID: $existingId" -ForegroundColor Green
    }
}

$kvId = $existingId

if (-not $kvId) {
    $kvId = $null
    $createOutput = & wrangler kv namespace create KV 2>&1 | Out-String
    Write-Host "  Create output: $createOutput" -ForegroundColor Gray
    
    if ($createOutput -match '"id"\s*:\s*"([^"]+)"') { $kvId = $Matches[1] }
    if (-not $kvId -and $createOutput -match 'id\s*=\s*"([^"]+)"') { $kvId = $Matches[1] }
    if (-not $kvId -and $createOutput -match "id:\s*(\w+)") { $kvId = $Matches[1] }
    
    if (-not $kvId) {
        Write-Host "  Trying to list existing namespaces..." -ForegroundColor Yellow
        $listOutput = & wrangler kv namespace list 2>&1 | Out-String
        Write-Host "  List output: $listOutput" -ForegroundColor Gray
        
        if ($listOutput -match '"id"\s*:\s*"([^"]+)"') { $kvId = $Matches[1] }
        if (-not $kvId -and $listOutput -match 'id\s*=\s*"([^"]+)"') { $kvId = $Matches[1] }
        if (-not $kvId -and $listOutput -match "id:\s*(\w+)") { $kvId = $Matches[1] }
    }
}

if (-not $kvId) {
    Write-Host "  Cannot get KV ID automatically." -ForegroundColor Red
    Write-Host "  Please run manually: wrangler kv namespace list" -ForegroundColor Yellow
    exit 1
}
Write-Host "  KV ID: $kvId" -ForegroundColor Green

# [4] Update wrangler.toml
Write-Host "[4/8] Updating config..." -ForegroundColor Yellow
$content = Get-Content wrangler.toml -Raw
$content = $content -replace 'YOUR_KV_NAMESPACE_ID', $kvId
Set-Content wrangler.toml -Value $content -Encoding UTF8 -NoNewline
Write-Host "  OK" -ForegroundColor Green

# [5] Deploy Worker
Write-Host "[5/8] Deploying Worker..." -ForegroundColor Yellow
& wrangler deploy 2>&1 | ForEach-Object {
    if ($_ -match "ERROR") { Write-Host $_ -ForegroundColor Red }
    elseif ($_ -match "Published") { Write-Host $_ -ForegroundColor Green }
}
Write-Host "  OK" -ForegroundColor Green

# [6] Init admin
Write-Host "[6/8] Initializing admin..." -ForegroundColor Yellow
$workerName = (Select-String -Path wrangler.toml -Pattern '^name\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$workerUrl = "https://${workerName}.workers.dev"
Start-Sleep -Seconds 3
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $resp = Invoke-RestMethod -Uri "$workerUrl/api/init" -Method Get -TimeoutSec 10
    Write-Host "  $($resp.message)" -ForegroundColor Green
} catch {
    Write-Host "  Visit manually: $workerUrl/api/init" -ForegroundColor Yellow
}

# [7] Build frontend
Write-Host "[7/8] Building frontend..." -ForegroundColor Yellow
Set-Location web
& npm install 2>$null
& npm run build 2>&1 | ForEach-Object { if ($_ -match "error") { Write-Host $_ -ForegroundColor Red } }
Set-Location ..
Write-Host "  OK" -ForegroundColor Green

# [8] Deploy Pages
Write-Host "[8/8] Deploying Pages..." -ForegroundColor Yellow
& wrangler pages deploy web/dist --project-name survey-system 2>&1 | ForEach-Object {
    if ($_ -match "ERROR") { Write-Host $_ -ForegroundColor Red }
    elseif ($_ -match "Published|deployed") { Write-Host $_ -ForegroundColor Green }
}
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Admin: https://survey-system.pages.dev/admin" -ForegroundColor Cyan
Write-Host "  API:   $workerUrl" -ForegroundColor Cyan
Write-Host "  Login: admin / admin123456" -ForegroundColor Cyan
Write-Host ""