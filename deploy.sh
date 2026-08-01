#!/bin/bash
# ============================================
# 🚀 问卷系统一键部署脚本 (Linux/Mac)
# 使用方法: chmod +x deploy.sh && ./deploy.sh
# ============================================

set -e
cd "$(dirname "$0")"

echo ""
echo "========================================"
echo "  📋 问卷系统 - Cloudflare 一键部署"
echo "========================================"
echo ""

# 检查环境
echo "🔍 检查环境..."
command -v node >/dev/null 2>&1 || { echo "❌ 未找到 Node.js"; exit 1; }
echo "  ✅ Node.js $(node --version)"

command -v wrangler >/dev/null 2>&1 || { echo "📦 安装 Wrangler..."; npm install -g wrangler; }
echo "  ✅ Wrangler $(wrangler --version)"

# 检查登录
echo ""
echo "🔐 检查 Cloudflare 登录..."
wrangler whoami || wrangler login
echo "  ✅ 已登录"

# 创建 D1
echo ""
echo "🗄️ 创建 D1 数据库..."
D1_OUTPUT=$(wrangler d1 create survey-db 2>&1)
echo "$D1_OUTPUT"
DATABASE_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id\s*=\s*"\K[^"]+')

if [ -z "$DATABASE_ID" ]; then
    echo "❌ 无法提取 database_id"
    exit 1
fi
echo "  ✅ Database ID: $DATABASE_ID"

# 创建 R2
echo ""
echo "📦 创建 R2 存储桶..."
wrangler r2 bucket create survey-files 2>/dev/null || true
echo "  ✅ R2 已就绪"

# 更新配置
echo ""
echo "📝 更新 wrangler.toml..."
sed -i "s/YOUR_D1_DATABASE_ID/$DATABASE_ID/g" wrangler.toml
echo "  ✅ 配置已更新"

# 初始化数据库
echo ""
echo "🗄️ 初始化数据库..."
wrangler d1 execute survey-db --file=schema.sql
wrangler d1 execute survey-db --command "INSERT OR IGNORE INTO admin_users (id, username, password_hash, display_name) VALUES ('admin-001', 'admin', 'admin123456', '系统管理员')"
echo "  ✅ 数据库已初始化"

# 部署 Worker
echo ""
echo "🚀 部署 Worker API..."
wrangler deploy
echo "  ✅ Worker 已部署"

# 构建前端
echo ""
echo "🔨 构建前端..."
cd web && npm install && npm run build && cd ..
echo "  ✅ 前端构建完成"

# 部署 Pages
echo ""
echo "🚀 部署前端..."
wrangler pages deploy web/dist --project-name survey-system
echo "  ✅ 前端已部署"

# 完成
echo ""
echo "========================================"
echo "  🎉 部署完成！"
echo "========================================"
echo ""
echo "  📋 后台管理: https://survey-system.pages.dev/admin"
echo "  🔑 登录账号: admin / admin123456"
echo ""
echo "  ⚠️ 请尽快修改默认管理员密码！"
echo ""
