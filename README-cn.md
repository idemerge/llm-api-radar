# LLM API Radar

[English](README.md) | **中文**

[![GitHub Stars](https://img.shields.io/github/stars/idemerge/llm-api-radar?style=flat-square)](https://github.com/idemerge/llm-api-radar/stargazers)
[![GitHub Release](https://img.shields.io/github/v/release/idemerge/llm-api-radar?style=flat-square)](https://github.com/idemerge/llm-api-radar/releases)
[![Docker Pulls](https://img.shields.io/docker/pulls/idemerge/llm-api-radar?style=flat-square)](https://hub.docker.com/r/idemerge/llm-api-radar)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**自托管的 LLM 性能测试与监控平台。**

在一个平台上对比、监控多家 LLM API 服务商 — 测量延迟、首 Token 时间（TTFT）、吞吐量和可靠性，支持 OpenAI、Anthropic、Google Gemini 及任何 OpenAI 兼容接口。一条命令即可通过 Docker 或脚本完成部署。

---

## 为什么选择 LLM API Radar？

在生产环境中使用 LLM 意味着要同时管理多家服务商，它们各自有着不同的延迟特征、速率限制和稳定性表现。公开的基准测试并不能反映**你的**网络环境、**你的**提示词、或**你的**流量模式。LLM API Radar 是一个自托管工具，让你可以：

- **基准测试** — 使用相同提示词对比各服务商，支持可配置并发数（1–5000）和预热运行
- **健康监控** — 持续检查服务商健康状态，四级评估（健康 / 较慢 / 很慢 / 宕机），24 小时历史记录
- **Playground** — 交互式测试任意模型，支持流式输出、多模态，完整的 Token 级指标
- **历史追踪** — 持久化存储所有测试记录，支持并排对比和 CSV/JSON 导出
- **一键部署** — 通过 Docker Compose 或 Shell 脚本一条命令启动，单个 `.env` 文件管理所有配置

## 演示

<p align="center">
  <img src="docs/demo.gif" alt="LLM API Radar 演示" width="960" />
</p>

## 截图

<table>
  <tr>
    <td align="center"><b>工作流 — 配置与运行</b></td>
    <td align="center"><b>监控 — 健康检查</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/screenshot-workflow.png" width="500" /></td>
    <td><img src="docs/screenshots/screenshot-monitor.png" width="500" /></td>
  </tr>
  <tr>
    <td align="center"><b>Playground — 模型测试</b></td>
    <td align="center"><b>历史 — 过往记录</b></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/screenshot-playground.png" width="500" /></td>
    <td><img src="docs/screenshots/screenshot-history.png" width="500" /></td>
  </tr>
</table>

## 功能特性

### 多服务商支持

- **OpenAI** — GPT-4o、GPT-4o-mini、o1、o3 等
- **Anthropic** — Claude 4 Sonnet、Opus、Haiku
- **Google Gemini** — 2.5 Pro、Flash
- **OpenAI 兼容接口** — DeepSeek、Mistral、本地模型（Ollama、vLLM）及其他兼容 OpenAI 协议的端点

### 全面的性能指标

| 指标 | 说明 |
| --- | --- |
| 响应时间 | 平均 / P50 / P95 / P99 延迟 |
| Token 速度 | 每秒输入和输出 Token 数 |
| TTFT | 首 Token 时间（流式输出） |
| 吞吐量 | 并发负载下的每秒请求数 |
| 成功率 | 完成请求数 vs 失败请求数 |
| 成本估算 | 按服务商的费用明细 |

### 实时可视化

- 基准测试执行期间的实时流式指标
- 按服务商分类的面积图（响应时间、Token 速度）
- 多维雷达对比图
- 全局统一的服务商色彩标识

### 工作流引擎

- 多任务工作流，顺序执行
- 每个任务独立配置提示词、并发数和迭代次数
- 快捷预设 — 512 / 4K / 16K Token，最高 5000 并发，最高 1000 万次迭代
- 预热运行，消除冷启动偏差

### Playground

- 向指定服务商/模型发送提示词并查看响应
- 支持流式和非流式模式
- 多模态支持 — 通过图片 URL 或上传文件测试多模态模型
- 显示 Token 计数、TTFT、TPS 和响应时间

### 健康监控

- 对选定的服务商/模型组合进行周期性健康检查
- 每次探测的丰富指标：TTFT、输出 Token 数、响应验证
- 可配置的健康阈值（延迟、TTFT、最小输出 Token 数）
- 每个模型独立设置检查间隔（5 分钟 – 6 小时），支持全局默认值
- 服务商并行、模型串行的调度策略
- 24 小时历史条形图，按颜色标识健康状态
- 自动刷新仪表盘，包含汇总统计

### 认证与安全

- 基于 JWT 的登录，凭证可配置
- 自动生成持久化密钥（JWT、加密密钥、Salt）— 无硬编码默认值
- 首次使用默认密码登录后强制修改密码
- 登录速率限制（5 分钟内最多 5 次尝试）
- Helmet 安全头及内容安全策略（CSP）
- SSE/下载 URL 使用一次性令牌（不再在 URL 中暴露 JWT）
- 会话级令牌存储（`sessionStorage`，关闭标签页即清除）
- CORS 限制为配置的来源（默认仅同源）
- 受保护的 API 路由和前端路由
- 会话过期自动跳转登录页

### 历史与导出

- 持久化的运行历史，包含完整结果详情
- 历史记录并排对比
- 导出为 JSON 或 CSV

### 部署

- 一键构建脚本（`start.sh`）
- Docker Compose，SQLite 数据卷持久化
- 单个 `.env` 文件管理所有配置

## 快速开始

### 方式一：一键脚本（生产环境）

```bash
git clone https://github.com/idemerge/llm-api-radar.git
cd llm-api-radar
cp .env.example .env    # 编辑 .env 设置凭证
chmod +x start.sh && ./start.sh
```

### 方式二：Docker Compose（生产环境）

```bash
git clone https://github.com/idemerge/llm-api-radar.git
cd llm-api-radar
cp .env.example .env    # 编辑 .env 设置凭证
docker compose up -d
```

### 方式三：开发环境

```bash
git clone https://github.com/idemerge/llm-api-radar.git
cd llm-api-radar
cp .env.example .env

# 后端
cd backend && npm install && npm run dev &

# 前端
cd ../frontend && npm install && npm run dev
```

打开 `http://localhost:5173`（开发）或 `http://localhost:3001`（生产）访问控制台。

### 配置项

所有配置通过项目根目录下的 `.env` 文件管理：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 服务端口 |
| `AUTH_USERNAME` | `admin` | 登录用户名 |
| `AUTH_PASSWORD` | `changeme` | 登录密码（首次登录需强制修改） |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥（留空则自动生成） |
| `JWT_EXPIRES_IN` | `24h` | JWT 令牌过期时间 |
| `ENCRYPTION_SECRET` | 自动生成 | API 密钥加密密钥（留空则自动生成） |
| `CORS_ORIGIN` | 仅同源 | 允许的 CORS 来源（如 `https://your-domain.com`） |

### 接入真实服务商

1. 使用凭证登录
2. 进入 **Settings（设置）**
3. 点击 **Add Provider（添加服务商）**
4. 选择协议格式（OpenAI / Anthropic / Gemini / OpenAI 兼容）
5. 输入 API 端点和密钥
6. 点击 **Test Connection（测试连接）** 验证
7. 开始测试！

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                        浏览器                            │
│  React 19 · Ant Design 5 · Recharts · Tailwind CSS v4  │
└────────────────────────┬────────────────────────────────┘
                         │ REST / SSE
┌────────────────────────▼────────────────────────────────┐
│                   Express 服务器                         │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │ 认证     │  │ REST API  │  │ SSE 流               │  │
│  │ (JWT)    │  │ /api/*    │  │ /api/workflows/:id   │  │
│  └──────────┘  └─────┬─────┘  └──────────┬───────────┘  │
│                      │                   │              │
│  ┌───────────────────▼───────────────────▼───────────┐  │
│  │                 服务层                             │  │
│  │  基准引擎 · 工作流运行器 · Playground              │  │
│  │  监控调度器 (node-cron)                           │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────▼───────────────────────────────┐  │
│  │              服务商适配器                           │  │
│  │  OpenAI · Anthropic · Gemini · OpenAI 兼容        │  │
│  └───────────────────┬───────────────────────────────┘  │
└──────────────────────┼──────────────────────────────────┘
                       │
          ┌────────────▼────────────┐
          │   SQLite (better-sqlite3) │
          │   单文件数据库            │
          └─────────────────────────┘
```

整个技术栈以**单个 Node.js 进程**运行 — 无需 Redis、无需 Postgres、无外部依赖。前端由 Vite 构建，作为静态文件由 Express 提供服务。SQLite（WAL 模式）将所有基准测试、工作流、监控历史和服务商配置存储在一个文件中，备份和迁移极其简单。

| 层 | 技术栈 |
| --- | --- |
| 前端 | React 19、Vite 8、TypeScript、Tailwind CSS v4 |
| UI 组件 | Ant Design 5（暗色主题）、Recharts、Framer Motion |
| 后端 | Node.js、Express 4、TypeScript |
| 认证 | JWT（jsonwebtoken + bcryptjs） |
| 存储 | SQLite（better-sqlite3，原生 SQL，无 ORM） |
| 调度 | node-cron |
| 部署 | Docker（多阶段 Alpine 构建）/ Shell 脚本 |

## Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=idemerge/llm-api-radar&type=Date)](https://star-history.com/#idemerge/llm-api-radar&Date)

## 参与贡献

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发环境搭建和贡献指南。

## 许可证

[MIT](LICENSE)
