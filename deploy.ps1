# ============================================
# 🚀 问卷系统一键部署脚本（KV 版 - 修复）
# ============================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  📋 问卷系统 - Cloudflare KV 部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查环境
Write-Host "🔍 检查环境..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "❌ 请先安装 Node.js >= 18"; exit 1 }
Write-Host "  ✅ Node.js $(node --version)" -ForegroundColor Green

if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
    Write-Host "📦 安装 Wrangler..." -ForegroundColor Yellow
    npm install -g wrangler
}
Write-Host "  ✅ Wrangler $(wrangler --version)" -ForegroundColor Green

# 检查登录
Write-Host ""
Write-Host "🔐 检查 Cloudflare 登录..." -ForegroundColor Yellow
wrangler whoami 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { wrangler login }
Write-Host "  ✅ 已登录" -ForegroundColor Green

# 创建 KV 命名空间
Write-Host ""
Write-Host "📦 创建 KV 命名空间..." -ForegroundColor Yellow
$kvOutput = wrangler kv namespace create KV 2>&1
Write-Host $kvOutput

$kvLine = $kvOutput | Select-String 'id\s*=\s*"([^"]+)"'
if (-not $kvLine) {
    Write-Host "❌ 无法获取 KV namespace ID" -ForegroundColor Red
    exit 1
}
$kvId = $kvLine.Matches[0].Groups[1].Value
Write-Host "  ✅ KV Namespace ID: $kvId" -ForegroundColor Green

# 更新 wrangler.toml
Write-Host ""
Write-Host "📝 更新 wrangler.toml..." -ForegroundColor Yellow
$content = Get-Content wrangler.toml -Raw
$content = $content -replace 'YOUR_KV_NAMESPACE_ID', $kvId
[System.IO.File]::WriteAllText("wrangler.toml", $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "  ✅ 配置已更新" -ForegroundColor Green

# 部署 Worker（不加 --no-bundle，让 Wrangler 自动编译 TypeScript）
Write-Host ""
Write-Host "🚀 部署 Worker API..." -ForegroundColor Yellow
wrangler deploy
Write-Host "  ✅ Worker 已部署" -ForegroundColor Green

# 初始化默认管理员
Write-Host ""
Write-Host "👤 初始化管理员账号..." -ForegroundColor Yellow
$workerName = (Select-String -Path wrangler.toml -Pattern '^name\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
$workerUrl = "https://${workerName}.workers.dev"
Start-Sleep -Seconds 3
try {
    $initResult = Invoke-RestMethod -Uri "$workerUrl/api/init" -Method Get
    Write-Host "  ✅ $($initResult.message)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️ 请稍后手动访问: $workerUrl/api/init" -ForegroundColor Yellow
}

# 构建前端
Write-Host ""
Write-Host "🔨 构建前端..." -ForegroundColor Yellow
cd web
npm install
npm run build
cd ..
Write-Host "  ✅ 前端构建完成" -ForegroundColor Green

# 部署 Pages
Write-Host ""
Write-Host "🚀 部署前端到 Cloudflare Pages..." -ForegroundColor Yellow
wrangler pages deploy web/dist --project-name survey-system
Write-Host "  ✅ 前端已部署" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🎉 部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  📋 后台管理: https://survey-system.pages.dev/admin" -ForegroundColor Cyan
Write-Host "  🌐 Worker API: $workerUrl" -ForegroundColor Cyan
Write-Host "  🔑 登录账号: admin / admin123456" -ForegroundColor Cyan
Write-Host ""
