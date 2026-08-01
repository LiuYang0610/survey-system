# 📋 问卷系统 - Cloudflare 全栈部署版

基于 Cloudflare Workers/Pages + D1 + R2 的完整问卷收集系统，支持多格式文件导入（Excel/Word/PDF）、自动草稿保存、数据统计分析。

## 🏗 系统架构

```
┌─────────────────────────────────────────────────┐
│              Cloudflare 全球 CDN                │
├────────────────────┬────────────────────────────┤
│   Cloudflare Pages │   Cloudflare Worker (API)  │
│   (前端静态资源)    │   (Hono 框架)              │
├────────────────────┼────────────────────────────┤
│   React SPA        │   ┌── D1 (SQLite 数据库)  │
│   - 前台填写页     │   ├── R2 (文件存储)       │
│   - 后台管理页     │   └── JWT 鉴权            │
└────────────────────┴────────────────────────────┘
```

## 📁 项目结构

```
survey-system/
├── schema.sql              # D1 数据库 Schema
├── seed.sql                # 默认管理员数据
├── wrangler.toml           # Cloudflare Worker 配置
├── package.json            # 后端依赖
├── tsconfig.json           # TypeScript 配置
├── src/                    # Worker API 源码
│   ├── index.ts            # Worker 入口（Hono）
│   ├── types.ts            # 类型定义
│   ├── lib/                # 工具库
│   │   ├── jwt.ts          # JWT 签发/验证
│   │   ├── uuid.ts         # UUID 生成
│   │   ├── r2.ts           # R2 存储操作
│   │   ├── parser-core.ts  # 通用文本解析
│   │   ├── parser-excel.ts # Excel 解析
│   │   ├── parser-word.ts  # Word 解析
│   │   └── parser-pdf.ts   # PDF 解析
│   ├── middleware/
│   │   └── auth.ts         # JWT 鉴权中间件
│   └── routes/             # API 路由
│       ├── auth.ts         # 认证路由
│       ├── admin.ts        # 管理后台路由
│       ├── import.ts       # 文件导入路由
│       ├── public.ts       # 公开访问路由
│       ├── draft.ts        # 草稿管理路由
│       └── submit.ts       # 答卷提交路由
└── web/                    # 前端 React 应用
    ├── index.html          # 入口 HTML
    ├── package.json        # 前端依赖
    ├── vite.config.ts      # Vite 配置
    └── src/                # React 源码
        ├── main.tsx        # React 入口
        ├── App.tsx         # 路由配置
        ├── lib/api.ts      # API 客户端
        └── pages/
            ├── survey/     # 前台填写页
            │   ├── SurveyPage.tsx
            │   └── SurveySuccess.tsx
            └── admin/      # 后台管理页
                ├── AdminLogin.tsx
                ├── AdminLayout.tsx
                ├── SurveyList.tsx
                ├── SurveyEdit.tsx
                ├── SurveyImport.tsx
                ├── SurveyStats.tsx
                └── ResponseList.tsx
```

## 🚀 快速开始

### 前置条件

- Node.js >= 18
- Cloudflare 账号（免费版即可）
- Wrangler CLI

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
wrangler login  # 登录 Cloudflare 账号
```

### 2. 创建 D1 数据库

```bash
cd survey-system

# 创建数据库
wrangler d1 create survey-db

# 将输出的 database_id 填入 wrangler.toml
```

### 3. 创建 R2 存储桶

```bash
wrangler r2 bucket create survey-files
```

### 4. 更新配置

编辑 `wrangler.toml`，填入正确的 database_id：

```toml
[[d1_databases]]
binding = "DB"
database_name = "survey-db"
database_id = "你的_D1_DATABASE_ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "survey-files"
```

### 5. 初始化数据库

```bash
# 生产环境
wrangler d1 execute survey-db --file=schema.sql

# 本地开发
wrangler d1 execute survey-db --local --file=schema.sql
```

### 6. 创建默认管理员

```bash
# 插入默认管理员（admin / admin123456）
wrangler d1 execute survey-db --command "INSERT INTO admin_users (id, username, password_hash, display_name) VALUES ('admin-001', 'admin', 'admin123456', '系统管理员')"
```

### 7. 本地开发

```bash
# 终端 1：启动 Worker API
npm run dev:worker

# 终端 2：启动前端开发服务器
cd web && npm run dev
```

访问 http://localhost:3000 查看前端

### 8. 部署到 Cloudflare

```bash
# 构建前端
cd web && npm run build

# 部署 Worker API
wrangler deploy

# 部署前端到 Pages
wrangler pages deploy web/dist --project-name survey-system
```

## 📋 功能特性

### 前台填写端

| 功能 | 说明 |
|------|------|
| 📱 自适应设计 | 自动适配手机、电脑、微信浏览器 |
| 💾 断点续填 | 自动保存草稿，刷新页面恢复进度 |
| ✅ 表单校验 | 必填题校验、选项校验 |
| 📊 多种题型 | 单选、多选、填空、量表 |
| 🔗 公开访问 | 通过唯一链接 `/s/{unique_key}` 访问 |

### 后台管理端

| 功能 | 说明 |
|------|------|
| 🔐 JWT 鉴权 | 安全的密码登录 |
| 📋 问卷管理 | 创建、编辑、删除、启停 |
| 📥 多格式导入 | Excel (.xlsx) / Word (.docx) / PDF |
| 📊 数据统计 | 饼图、柱状图、文本列表 |
| 📝 答卷管理 | 分页列表、详情查看、时间筛选 |
| 📥 数据导出 | CSV 格式导出答卷数据 |

## 📥 文件导入格式规范

### 通用规则

1. **第一行** = 问卷名称
2. **题目格式**：序号 + 题干，如 `1、你的职业？`
3. **题型标记**：`【单选】` `【多选】` `【填空】` `【量表】`
4. **选项分行**：`A、xxx` 或 `1、xxx`
5. **必填标识**：标注 `【必填】`

### 示例文档

```
客户满意度调查

感谢您参与本次调查，您的反馈对我们非常重要。

1、您的性别？【单选】【必填】
A、男
B、女

2、您使用过我们哪些产品？【多选】
A、产品A
B、产品B
C、产品C

3、您对我们服务的总体评分？【量表】【必填】
1（非常不满意）~ 5（非常满意）

4、您的建议或意见？【填空】
```

## 🔧 环境变量

在 `wrangler.toml` 中配置：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key` |
| `ADMIN_DEFAULT_PASSWORD` | 默认管理员密码 | `admin123456` |

## 📡 API 路由

### 公开 API（无需鉴权）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/survey/:unique_key` | 获取问卷数据 |
| POST | `/api/survey/:unique_key/visit` | 记录访问 |
| GET | `/api/draft/:survey_id/:user_uuid` | 获取草稿 |
| POST | `/api/draft` | 保存草稿 |
| POST | `/api/submit` | 提交答卷 |

### 管理 API（需要 JWT）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录 |
| GET | `/api/admin/surveys` | 问卷列表 |
| POST | `/api/admin/surveys` | 创建问卷 |
| GET | `/api/admin/surveys/:id` | 问卷详情 |
| PUT | `/api/admin/surveys/:id` | 更新问卷 |
| DELETE | `/api/admin/surveys/:id` | 删除问卷 |
| PUT | `/api/admin/surveys/:id/questions` | 更新题目 |
| GET | `/api/admin/surveys/:id/stats` | 问卷统计 |
| GET | `/api/admin/surveys/:id/responses` | 答卷列表 |
| GET | `/api/admin/surveys/:id/export` | 导出数据 |
| POST | `/api/admin/import/presign` | 生成上传 URL |
| POST | `/api/admin/import/upload/:id` | 上传文件 |
| POST | `/api/admin/import/parse/:id` | 解析文件 |
| POST | `/api/admin/import/confirm` | 确认导入 |

## 🛡 安全说明

- 管理后台通过 JWT 鉴权保护
- 草稿通过 `user_uuid`（浏览器 localStorage）隔离
- 同一用户对同一问卷只能提交一次（可配置）
- 文件上传限制 10MB，仅支持指定格式
- 所有 API 经过 Cloudflare 边缘网络，自带 DDoS 防护

## 📝 注意事项

1. **PDF 解析**：仅支持可复制文本的 PDF，扫描件/图片 PDF 无法解析
2. **Excel 格式**：仅支持 `.xlsx`，不支持旧版 `.xls`
3. **Word 格式**：仅支持 `.docx`，不支持旧版 `.doc`
4. **部署域名**：Cloudflare Pages 部署后会自动分配域名，也可绑定自定义域名
5. **D1 数据库**：免费版包含 5GB 存储和 500 万行读取/天

## 📄 License

MIT License
