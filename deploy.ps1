# ============================================
# 🚀 问卷系统一键部署脚本
# 使用方法：右键 → 用 PowerShell 运行
# 或在 PowerShell 中执行：.\deploy.ps1
# ============================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  📋 问卷系统 - Cloudflare 一键部署" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 检查环境 ----------
Write-Host "🔍 检查环境..." -ForegroundColor Yellow

# 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js，请先安装 Node.js >= 18" -ForegroundColor Red
    exit 1
}
$nodeVer = node --version
Write-Host "  ✅ Node.js $nodeVer" -ForegroundColor Green

# 检查 Wrangler
$wrangler = Get-Command wrangler -ErrorAction SilentlyContinue
if (-not $wrangler) {
    Write-Host "📦 安装 Wrangler CLI..." -ForegroundColor Yellow
    npm install -g wrangler
}
$wranglerVer = wrangler --version
Write-Host "  ✅ Wrangler $wranglerVer" -ForegroundColor Green

# 检查登录状态
Write-Host ""
Write-Host "🔐 检查 Cloudflare 登录状态..." -ForegroundColor Yellow
$whoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠️ 未登录 Cloudflare，正在打开浏览器登录..." -ForegroundColor Yellow
    wrangler login
}
Write-Host "  ✅ 已登录 Cloudflare" -ForegroundColor Green

# ---------- 创建 D1 数据库 ----------
Write-Host ""
Write-Host "🗄️ 创建 D1 数据库..." -ForegroundColor Yellow
$d1Output = wrangler d1 create survey-db 2>&1
Write-Host $d1Output

# 提取 database_id
$d1Line = $d1Output | Select-String 'database_id\s*=\s*"([^"]+)"'
if (-not $d1Line) {
    Write-Host "❌ 无法提取 D1 database_id，请手动检查" -ForegroundColor Red
    exit 1
}
$databaseId = $d1Line.Matches[0].Groups[1].Value
Write-Host "  ✅ Database ID: $databaseId" -ForegroundColor Green

# ---------- 创建 R2 存储桶 ----------
Write-Host ""
Write-Host "📦 创建 R2 存储桶..." -ForegroundColor Yellow
try {
    wrangler r2 bucket create survey-files 2>&1
    Write-Host "  ✅ R2 存储桶已创建" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️ R2 存储桶可能已存在，继续..." -ForegroundColor Yellow
}

# ---------- 更新 wrangler.toml ----------
Write-Host ""
Write-Host "📝 更新 wrangler.toml 配置..." -ForegroundColor Yellow
$content = Get-Content wrangler.toml -Raw
$content = $content -replace 'YOUR_D1_DATABASE_ID', $databaseId
Set-Content wrangler.toml -Value $content -NoNewline
Write-Host "  ✅ wrangler.toml 已更新" -ForegroundColor Green

# ---------- 初始化数据库 ----------
Write-Host ""
Write-Host "🗄️ 初始化数据库表结构..." -ForegroundColor Yellow
wrangler d1 execute survey-db --file=schema.sql
Write-Host "  ✅ 数据表已创建" -ForegroundColor Green

Write-Host ""
Write-Host "👤 创建默认管理员账号..." -ForegroundColor Yellow
wrangler d1 execute survey-db --command "INSERT OR IGNORE INTO admin_users (id, username, password_hash, display_name) VALUES ('admin-001', 'admin', 'admin123456', '系统管理员')"
Write-Host "  ✅ 管理员已创建 (admin / admin123456)" -ForegroundColor Green

# ---------- 部署 Worker API ----------
Write-Host ""
Write-Host "🚀 部署 Worker API..." -ForegroundColor Yellow
wrangler deploy
Write-Host "  ✅ Worker API 已部署" -ForegroundColor Green

# ---------- 构建前端 ----------
Write-Host ""
Write-Host "🔨 构建前端..." -ForegroundColor Yellow
Set-Location web
npm install
npm run build
Set-Location ..
Write-Host "  ✅ 前端构建完成" -ForegroundColor Green

# ---------- 部署 Pages ----------
Write-Host ""
Write-Host "🚀 部署前端到 Cloudflare Pages..." -ForegroundColor Yellow
wrangler pages deploy web/dist --project-name survey-system
Write-Host "  ✅ 前端已部署" -ForegroundColor Green

# ---------- 完成 ----------
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  🎉 部署完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  📋 后台管理: https://survey-system.pages.dev/admin" -ForegroundColor Cyan
Write-Host "  🔑 登录账号: admin / admin123456" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ⚠️ 请尽快修改默认管理员密码！" -ForegroundColor Yellow
Write-Host ""
