# LLM API Bench — Design Document

> Version: v1.2.0 | Last updated: 2026-04-03

## Table of Contents

- [1. Overview](#1-overview)
- [2. Architecture](#2-architecture)
- [3. Backend](#3-backend)
  - [3.1 Express Server](#31-express-server)
  - [3.2 Provider Adapter](#32-provider-adapter)
  - [3.3 Benchmark Engine](#33-benchmark-engine)
  - [3.4 Workflow Engine](#34-workflow-engine)
  - [3.5 Monitor System](#35-monitor-system)
  - [3.6 Data Storage](#36-data-storage)
- [4. Frontend](#4-frontend)
  - [4.1 Tech Stack](#41-tech-stack)
  - [4.2 Page Structure](#42-page-structure)
  - [4.3 Component Map](#43-component-map)
  - [4.4 State Management](#44-state-management)
- [5. Data Model](#5-data-model)
- [6. API Reference](#6-api-reference)
- [7. Security](#7-security)
- [8. File Structure](#8-file-structure)

---

## 1. Overview

LLM API Bench is a self-hosted web application for measuring and comparing LLM API performance. It supports OpenAI, Anthropic, Google Gemini, and any OpenAI-compatible endpoint. Users configure providers, create benchmark workflows, and view results with real-time charts and radar comparisons.

**Key capabilities:**

- **Workflow Engine** — Multi-task benchmark pipelines with configurable concurrency, iterations, and warmup
- **Playground** — Interactive prompt testing with streaming support and vision input
- **Monitor** — Periodic health checks with TTFT, token validation, and configurable thresholds
- **History** — Persistent run history with export (JSON/CSV) and duplication

---

## 2. Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│   React 19 · Vite · Tailwind v4 · Ant Design 6  │
│   Recharts · Framer Motion                       │
└────────────────────┬────────────────────────────┘
                     │ HTTP / SSE
┌────────────────────▼────────────────────────────┐
│                   Backend                        │
│        Express.js · TypeScript · Port 3001       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Routes  │ │ Services │ │ Provider Adapter  │ │
│  │ REST+SSE │ │ Engines  │ │ OpenAI/Anthropic/ │ │
│  │          │ │ Schedulers│ │ Gemini/Custom     │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│              ┌──────────────┐                    │
│              │   SQLite     │                    │
│              │ (better-sqlite3)                  │
│              └──────────────┘                    │
└─────────────────────────────────────────────────┘
```

The frontend is served as static files in production. During development, Vite dev server proxies API requests to the backend.

---

## 3. Backend

### 3.1 Express Server

Entry point: `backend/src/index.ts`

- CORS enabled for all origins
- JSON body parser with 10MB limit (for base64 images)
- Static file serving from `frontend/dist` in production
- Health check endpoint at `GET /api/health`
- Scheduler starts 5 seconds after server boot

### 3.2 Provider Adapter

The `DynamicProvider` class (`backend/src/providers/adapter.ts`) handles all LLM API communication through a unified interface.

**Supported formats:**

| Format      | Endpoint                          | Auth               | Streaming | Vision       |
| ----------- | --------------------------------- | ------------------ | --------- | ------------ |
| `openai`    | `/chat/completions`               | `Bearer` token     | Yes       | URL + base64 |
| `anthropic` | `/messages`                       | `x-api-key` header | Yes       | base64 only  |
| `gemini`    | `/models/{model}:generateContent` | Query param `key`  | No        | base64 only  |
| `custom`    | `/chat/completions`               | `Bearer` token     | Yes       | URL + base64 |

**Key methods:**

- `execute(prompt, systemPrompt, maxTokens, images, streaming)` → `LLMResponse`
- `callOpenAI()` / `callAnthropic()` / `callGemini()` — format-specific non-streaming implementations
- `callOpenAIStreaming()` / `callAnthropicStreaming()` — format-specific streaming implementations

**LLMResponse fields:**

```typescript
{
  text: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  responseTime: number; // Total latency in ms
  firstTokenLatency: number; // TTFT in ms
  estimatedCost: number;
  model: string;
}
```

**Factory functions:**

- `createDynamicProvider(providerId, modelName)` — creates provider from stored config with decrypted API key
- `testProviderConnection(config)` — connectivity test with rich metrics (latency, TTFT, tokens, response text)

**Error handling:**

- Automatic retry with exponential backoff for rate limits (429) and network errors
- `AbortController`-based request timeouts
- Error categorization: `rate_limit`, `timeout`, `auth`, `server_error`, `network`, `unknown`

### 3.3 Benchmark Engine

File: `backend/src/services/benchmarkEngine.ts`

Executes benchmarks for a set of providers with configurable parameters:

- **Concurrency**: Runs N parallel requests per iteration
- **Iterations**: Repeats the benchmark M times
- **Warmup**: Optional warmup runs excluded from statistics
- **Streaming**: Measures TTFT and per-token throughput
- **Vision**: Supports image inputs alongside text prompts

Emits SSE events: `progress` (per-iteration), `provider_complete`, `complete`.

Aggregates results into `ProviderSummary` with P50/P95/P99 percentiles.

### 3.4 Workflow Engine

File: `backend/src/services/workflowEngine.ts`

Orchestrates multi-task benchmarks:

1. Executes tasks sequentially with configurable cooldown between tasks
2. Each task can target all or a subset of providers
3. Supports stop-on-failure option
4. Aggregates cross-task summary with rankings
5. 11 built-in templates (Quick Benchmark, Latency Profile, Concurrency Ladder, etc.)

**Workflow lifecycle:** `draft` → `running` → `completed` / `failed` / `cancelled`

Emits SSE events: `workflow_started`, `task_started`, `task_progress`, `task_completed`, `workflow_completed`.

### 3.5 Monitor System

Three components working together:

**`monitorScheduler.ts`** — Cron-based scheduler

- Checks every minute (`node-cron`)
- Per-target intervals (5–360 minutes), stored in `monitor_targets`
- Parallel across providers, serial models within provider
- `isRunning` lock prevents concurrent execution
- Manual trigger via `triggerManualCheck()`

**`monitorConfigStore.ts`** — Configuration persistence

- `monitor_targets` table: selected provider+model pairs with per-model interval
- `monitor_config` table: global settings (default interval, health thresholds)
- Health thresholds: `latencySlowMs` (2000), `latencyVerySlowMs` (5000), `ttftSlowMs` (1000), `minOutputTokens` (1)

**`monitorStore.ts`** — Ping result persistence

- `monitor_pings` table with rich metrics per probe
- `getLatest()` returns most recent ping per provider+model
- `getRecent(hours)` returns all pings within time window
- `cleanup(days)` removes pings older than N days (default 7)

**Probe behavior:**

- Sends `'Hello'` with `maxTokens=500` (non-streaming)
- Records: latency, TTFT, output tokens, response text (truncated to 200 chars)
- Validates: empty response (0 tokens + empty text) → status `error`

### 3.6 Data Storage

All data stored in SQLite via `better-sqlite3`.

Database file: `backend/data/benchmarks.db`

Tables are auto-created on startup. Schema migrations use `ALTER TABLE` with try/catch for backward compatibility.

---

## 4. Frontend

### 4.1 Tech Stack

| Layer      | Technology                |
| ---------- | ------------------------- |
| Framework  | React 19 + TypeScript     |
| Build      | Vite 8                    |
| Styling    | Tailwind CSS v4           |
| UI Library | Ant Design 6 (dark theme) |
| Charts     | Recharts 3                |
| Animation  | Framer Motion 12          |
| Routing    | react-router-dom 7        |

### 4.2 Page Structure

| Path           | Page       | Description                                   |
| -------------- | ---------- | --------------------------------------------- |
| `/workflow`    | Workflow   | Configure and run multi-task benchmarks       |
| `/history`     | History    | Browse past workflow runs                     |
| `/history/:id` | Detail     | View single workflow results with charts      |
| `/monitor`     | Monitor    | Real-time API health dashboard                |
| `/playground`  | Playground | Interactive model testing (streaming, vision) |
| `/settings`    | Settings   | Provider management (CRUD, connection test)   |

### 4.3 Component Map

| Component                 | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `Sidebar.tsx`             | Fixed left navigation with status indicator |
| `WorkflowConfigPanel.tsx` | Workflow config form with templates         |
| `WorkflowProgress.tsx`    | Live execution progress                     |
| `WorkflowResults.tsx`     | Post-run results with charts and radar      |
| `HistoryPanel.tsx`        | Workflow history list with actions          |
| `HistoryDetailPage.tsx`   | Detailed single-run view                    |
| `MonitorPage.tsx`         | Health dashboard with status cards          |
| `PlaygroundPage.tsx`      | Model testing with streaming/vision         |
| `SettingsPage.tsx`        | Provider CRUD with connection test          |
| `LiveChart.tsx`           | Real-time area chart (Recharts)             |
| `MetricCard.tsx`          | KPI metric display card                     |
| `RadarComparison.tsx`     | Multi-dimension radar chart                 |
| `NeonGauge.tsx`           | Custom gauge visualization                  |

### 4.4 State Management

No global state library. Each page uses custom hooks:

| Hook            | State Managed                                               |
| --------------- | ----------------------------------------------------------- |
| `useWorkflow`   | Workflows list, current workflow, templates, SSE connection |
| `useProviders`  | Provider list, CRUD operations                              |
| `usePlayground` | Prompt execution, streaming, metrics, abort                 |
| `useMonitor`    | Statuses, history, targets, global config, auto-refresh     |

---

## 5. Data Model

### Table: `benchmarks`

| Column             | Type        | Description                            |
| ------------------ | ----------- | -------------------------------------- |
| `id`               | TEXT PK     | Benchmark ID (bench_xxxxxxxx)          |
| `status`           | TEXT        | pending / running / completed / failed |
| `providers`        | TEXT (JSON) | Provider key array                     |
| `config`           | TEXT (JSON) | BenchmarkConfig                        |
| `results`          | TEXT (JSON) | Per-provider results                   |
| `capability_tests` | TEXT (JSON) | Optional capability test results       |
| `created_at`       | TEXT        | ISO timestamp                          |
| `completed_at`     | TEXT        | ISO timestamp                          |

### Table: `workflows`

| Column                        | Type        | Description                                      |
| ----------------------------- | ----------- | ------------------------------------------------ |
| `id`                          | TEXT PK     | Workflow ID (wf_xxxxxxxx)                        |
| `name`                        | TEXT        | Display name                                     |
| `description`                 | TEXT        | Optional description                             |
| `status`                      | TEXT        | draft / running / completed / failed / cancelled |
| `providers`                   | TEXT (JSON) | Provider key array                               |
| `provider_labels`             | TEXT (JSON) | Display name map                                 |
| `tasks`                       | TEXT (JSON) | WorkflowTask array                               |
| `options`                     | TEXT (JSON) | WorkflowOptions                                  |
| `task_results`                | TEXT (JSON) | WorkflowTaskResult array                         |
| `summary`                     | TEXT (JSON) | Optional aggregated summary                      |
| `created_at` / `updated_at`   | TEXT        | ISO timestamps                                   |
| `started_at` / `completed_at` | TEXT        | ISO timestamps                                   |

### Table: `providers`

| Column                      | Type        | Description                          |
| --------------------------- | ----------- | ------------------------------------ |
| `id`                        | TEXT PK     | UUID                                 |
| `name`                      | TEXT        | Display name                         |
| `endpoint`                  | TEXT        | API base URL                         |
| `api_key_encrypted`         | TEXT        | AES-256 encrypted API key            |
| `format`                    | TEXT        | openai / anthropic / gemini / custom |
| `models`                    | TEXT (JSON) | ModelConfig array                    |
| `created_at` / `updated_at` | TEXT        | ISO timestamps                       |

### Table: `monitor_pings`

| Column          | Type       | Description          |
| --------------- | ---------- | -------------------- |
| `id`            | INTEGER PK | Auto-increment       |
| `provider_id`   | TEXT       | Provider config ID   |
| `provider_name` | TEXT       | Display name         |
| `model_name`    | TEXT       | Model identifier     |
| `status`        | TEXT       | ok / error / timeout |
| `latency_ms`    | INTEGER    | Total response time  |
| `ttft_ms`       | INTEGER    | Time to first token  |
| `output_tokens` | INTEGER    | Tokens generated     |
| `response_text` | TEXT       | First 200 chars      |
| `error_message` | TEXT       | Error details        |
| `checked_at`    | TEXT       | ISO timestamp        |

### Table: `monitor_targets`

| Column             | Type    | Description                         |
| ------------------ | ------- | ----------------------------------- |
| `provider_id`      | TEXT PK | Provider config ID                  |
| `model_name`       | TEXT PK | Model identifier                    |
| `provider_name`    | TEXT    | Display name                        |
| `interval_minutes` | INTEGER | Check interval (0 = global default) |
| `enabled`          | INTEGER | 1 = active                          |

### Table: `monitor_config`

| Column  | Type        | Description                                    |
| ------- | ----------- | ---------------------------------------------- |
| `key`   | TEXT PK     | Config key (global)                            |
| `value` | TEXT (JSON) | `{ defaultIntervalMinutes, healthThresholds }` |

---

## 6. API Reference

### Benchmarks

| Method | Path                         | Description         |
| ------ | ---------------------------- | ------------------- |
| POST   | `/api/benchmarks`            | Start benchmark run |
| GET    | `/api/benchmarks`            | List all runs       |
| GET    | `/api/benchmarks/:id`        | Get run details     |
| GET    | `/api/benchmarks/:id/stream` | SSE live progress   |
| GET    | `/api/benchmarks/:id/export` | Export (JSON/CSV)   |
| POST   | `/api/benchmarks/:id/cancel` | Cancel run          |

### Workflows

| Method | Path                           | Description               |
| ------ | ------------------------------ | ------------------------- |
| POST   | `/api/workflows`               | Create and start workflow |
| GET    | `/api/workflows`               | List all workflows        |
| GET    | `/api/workflows/templates`     | Get built-in templates    |
| GET    | `/api/workflows/active`        | Get running workflow      |
| GET    | `/api/workflows/:id`           | Get workflow details      |
| GET    | `/api/workflows/:id/stream`    | SSE live progress         |
| POST   | `/api/workflows/:id/cancel`    | Cancel workflow           |
| GET    | `/api/workflows/:id/export`    | Export results            |
| POST   | `/api/workflows/:id/duplicate` | Duplicate config          |
| DELETE | `/api/workflows/:id`           | Delete workflow           |

### Providers

| Method | Path                             | Description         |
| ------ | -------------------------------- | ------------------- |
| GET    | `/api/providers`                 | List providers      |
| POST   | `/api/providers`                 | Create provider     |
| GET    | `/api/providers/:id`             | Get provider        |
| PUT    | `/api/providers/:id`             | Update provider     |
| DELETE | `/api/providers/:id`             | Delete provider     |
| POST   | `/api/providers/:id/test`        | Test saved provider |
| POST   | `/api/providers/test-connection` | Test before saving  |

### Playground

| Method | Path                     | Description           |
| ------ | ------------------------ | --------------------- |
| POST   | `/api/playground/run`    | Non-streaming request |
| POST   | `/api/playground/stream` | SSE streaming request |

### Monitor

| Method | Path                               | Description            |
| ------ | ---------------------------------- | ---------------------- |
| GET    | `/api/monitor/config`              | Global config          |
| PUT    | `/api/monitor/config`              | Update config          |
| GET    | `/api/monitor/targets`             | List targets           |
| PUT    | `/api/monitor/targets`             | Replace all targets    |
| POST   | `/api/monitor/targets`             | Add target             |
| DELETE | `/api/monitor/targets/:pid/:model` | Remove target          |
| GET    | `/api/monitor/status`              | Latest ping per target |
| GET    | `/api/monitor/history?hours=24`    | Recent pings           |
| POST   | `/api/monitor/run`                 | Manual trigger         |

---

## 7. Security

- **API key encryption**: AES-256-CBC encryption at rest via `backend/src/utils/encryption.ts`
- **No plaintext keys in database**: `providerStore.getDecryptedApiKey()` decrypts on-demand
- **CORS**: Open by default (self-hosted tool, no public users)
- **No authentication**: Designed for local/single-user deployment

---

## 8. File Structure

```
llm-benchmark-v2/
├── backend/
│   ├── src/
│   │   ├── index.ts                    # Express entry point
│   │   ├── types.ts                    # Shared type definitions
│   │   ├── routes/
│   │   │   ├── benchmarks.ts           # Benchmark REST + SSE
│   │   │   ├── workflows.ts            # Workflow REST + SSE
│   │   │   ├── providers.ts            # Provider CRUD
│   │   │   ├── playground.ts           # Playground run/stream
│   │   │   └── monitor.ts              # Monitor config/status
│   │   ├── services/
│   │   │   ├── store.ts                # Benchmark SQLite store
│   │   │   ├── benchmarkEngine.ts      # Benchmark execution
│   │   │   ├── workflowStore.ts         # Workflow SQLite store
│   │   │   ├── workflowEngine.ts        # Workflow orchestration
│   │   │   ├── workflowTemplates.ts     # 11 built-in templates
│   │   │   ├── providerStore.ts         # Provider config store
│   │   │   ├── capabilityTester.ts      # Model capability tests
│   │   │   ├── monitorStore.ts          # Monitor ping store
│   │   │   ├── monitorConfigStore.ts    # Monitor config/targets
│   │   │   └── monitorScheduler.ts      # Cron health checker
│   │   ├── providers/
│   │   │   ├── base.ts                  # Abstract BaseLLMProvider
│   │   │   └── adapter.ts              # DynamicProvider (4 formats)
│   │   └── utils/
│   │       └── encryption.ts           # AES-256 encryption
│   ├── data/
│   │   └── benchmarks.db               # SQLite database
│   └── package.json                    # v1.2.0
├── frontend/
│   ├── src/
│   │   ├── App.tsx                     # Routing + theme config
│   │   ├── types.ts                    # Frontend type definitions
│   │   ├── constants.ts                # Presets, prompts, version
│   │   ├── components/                 # 18 React components
│   │   └── hooks/                      # 5 custom hooks
│   ├── vite.config.ts                  # Vite + Tailwind + proxy
│   └── package.json                    # v1.2.0
├── docs/
│   └── screenshots/                    # README screenshots (1100x720)
├── design/
│   └── DESIGN.md                       # This document
├── CLAUDE.md                           # AI assistant instructions
└── README.md                           # Project overview
```
