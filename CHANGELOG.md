# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.12.1] - 2026-04-28

### Fixed
- Touch targets undersized: removed `size="small"` from Settings buttons, increased model tag padding
- Heading scale too flat: increased H1 from 20px to 24px
- Capability tags (T/S/V) nearly illegible: increased font from 8px to 10px with larger padding
- Mobile parameter labels overflow: responsive grid for Core Parameters section
- Playground history panel overlaps form on mobile: full-screen overlay on mobile
- Grammar: "1 models" now correctly pluralized across Monitor and History pages
- antd deprecation: replaced Alert `message` prop with `title` (5 instances)
- History page duplicate heading: removed redundant H2 title (topbar already shows page name)

## [2.12.0] - 2026-04-28

### Added
- Naming validation rules for Provider name, Model ID, and DisplayName (backend + frontend)
  - Provider name: alphanumeric/dash/underscore, no spaces, 1-64 chars
  - Model ID: alphanumeric/dash/underscore/dot/slash, 1-64 chars (LiteLLM compatible)
  - DisplayName: alphanumeric/space/dash/underscore/dot, 1-64 chars
- Frontend real-time validation with error hints on Settings provider form
- Frontend validation unit tests (16 cases)
- Backend validation boundary tests (4 cases)

### Changed
- Renamed project from LLM API Radar to **LLM API Bench** (repo, UI, docs, Docker image)
- Playground history sidebar now shows `ProviderName/DisplayName` instead of raw model ID
- Backend stores model displayName in playground history for friendly display
- Adaptive QuickButtons sizing: auto-shrink when >7 options to prevent line wrapping

### Fixed
- Getting Started hint no longer flashes on page refresh (waits for data load)
- Playground provider/model selectors no longer flash raw IDs before names load
- Playground history correctly resolves model displayName from provider data

## [2.11.3] - 2026-04-28

### Changed
- Raised max concurrency from 1000 to 5000 (frontend InputNumber, backend validation schemas, route caps)
- Raised max iterations from 1M to 10M (frontend InputNumber, backend validation schemas, route caps)
- Added quick-select buttons for 2K/5K concurrency and 5M/10M iterations
- Updated README (EN/CN) with corrected `cd` path and new concurrency/iterations limits
- Fixed Quick Start instructions: `cd llm-benchmark` → `cd llm-api-bench`

## [2.11.2] - 2026-04-27

### Changed
- Demo mode now masks vendor-prefixed model names (e.g. `z-ai/glm-4.7` → `ProviderX/glm-4.7`) and workflow `providerSummaries`, sharing a single id-stable letter namespace across providers and vendors
- Masking is fully applied at the React hook fetch boundary (`useWorkflow`, `useMonitor`, `usePlaygroundHistory`, `useProviders`); the legacy DOM regex redactor is now a deprecated no-op safety net
- Regenerated all 6 README screenshots and `docs/demo.gif` under `VITE_DEMO_MODE=true`

### Fixed
- Workflow result table no longer leaks raw provider names through `summary.providerSummaries[*].provider` (previously masked only by the DOM regex layer)

## [2.11.1] - 2026-04-27

### Added
- Sensitive info redaction module (`scripts/redact-sensitive.mjs`) for screenshots and GIF recording — provider names, API URLs, and keys are automatically replaced with generic labels
- Screenshot script (`take-screenshots.mjs`) now calls `redactPage()` before each capture
- Demo recorder (`record-demo.mjs`) installs a persistent `MutationObserver` to redact text as React re-renders during screencast

### Fixed
- Playground: disable image upload button for non-vision models and clear uploaded images when switching to a non-vision model
- Workflow SSE: fix race condition where `activeRunIdRef` was cleared after `fetchWorkflow`, causing stale state — now fetches final workflow state directly before clearing ref

### Changed
- Regenerated all 6 screenshots and demo GIF with redacted sensitive information
- Removed `prettier` from frontend and backend devDependencies (unused)

## [2.11.0] - 2026-04-27

### Added
- Workflow page now shows the same Mission Control header (status, duration, edit) and Live Metrics strip (avg RT, TPS, last RT) + cooldown countdown that History Detail had — exposed via `liveMetrics` and `cooldown` from `useWorkflow`
- New shared `WorkflowHeader` component used by both the active Workflow page and History Detail

### Changed
- Refactored `HistoryDetailPage` to compose `WorkflowHeader` instead of duplicating header markup (~280 line reduction)
- Tightened pre-commit lint gate: `lint-staged` now runs `eslint --max-warnings 0` on staged frontend files

### Fixed
- CI lint failure on v2.10.1: removed empty `catch {}` block in `HistoryDetailPage` and silenced react-hooks warnings via targeted disables (no behavior change)
- Various react-hooks lint warnings across `ConfigPanel`, `MonitorPage`, `PlaygroundPage`, `WorkflowConfigPanel`, `WorkflowProgress`

## [2.10.1] - 2026-04-23

### Changed
- Raised concurrency limit from 200 to 1000 and iterations limit from 2000 to 1M (frontend InputNumber + backend Math.min caps)
- Updated quick-select buttons: concurrency adds 500 and 1K options, iterations adds 10K, 100K, and 1M options

## [2.10.0] - 2026-04-23

### Added
- Workflow name inline editing with PATCH endpoint and edit UI in History Detail header
- Running workflow "Mission Control" experience: live metrics strip (avg RT, TPS, last RT), cooldown countdown timer between tasks, real-time elapsed timer
- Completed workflow stat-card dashboard: Duration, Tokens, Best Avg RT, Success Rate, Total T/s in a 6-column grid
- History list redesign: colored status icons, config chips (concurrency × iterations × tokens + cache rate + stream), dedicated Models column with provider-colored tags, Duration and Tokens columns
- Monitor Settings as Modal dialog (replaces inline collapsible panel) with scrollable Targets area
- CSS design system additions: `stat-card` / `stat-value` / `stat-label`, `section-header` with color variants, `running-card-glow` animation, `running-row-active` styling, Ant Design overrides for tables, tooltips, and popconfirm

### Changed
- History Detail running state: animated amber border glow, live metrics from SSE `latestResults`, per-task completed summaries showing fastest RT and highest TPS providers
- History Detail completed state: stat-card grid replaces flat text metrics for visual impact
- History Panel: complete rewrite with richer row content and consistent visual hierarchy
- Monitor: summary bar uses `stat-card` CSS class, threshold inputs use Ant Design `InputNumber`, chart tooltip uses CSS variables, removed redundant tok/s display, unified TTFT/TPS status coloring
- Playground: MetricsRow uses `stat-card` with provider-colored accents, provider label uses `getProviderColor`
- WorkflowResults: removed bar charts (MetricBarChart, TaskCharts) — cleaner table-only layout
- WorkflowProgress: added live metrics strip, cooldown timer, elapsed timer, completed task summary pills
- WorkflowConfigPanel: cache hit rate input width narrowed for compact layout

## [2.6.0] - 2026-04-23

### Added
- Output Scope selector for long-context presets (16K/64K/150K/256K): controls how many documents the model reads, limiting output length (~500 tokens for 3 docs, unlimited for All docs)
- Output Scope available in Benchmark, Workflow, and Playground pages with persistent selection via localStorage
- Input/Output/Total throughput metrics in Workflow Detail: calculated as concurrency × avg tokens per request / avg response time
- Throughput columns (In T/s, Out T/s, Total T/s) in provider comparison tables
- Throughput summary in workflow header and results summary bar
- Tooltips on all metric labels, table column headers, and parameter controls across all pages (WorkflowResults, ResultsPanel, ConfigPanel, PlaygroundPage, HistoryDetailPage)

### Changed
- Long-context 64K preset prompt suffix updated to support configurable output scope

## [2.5.1] - 2026-04-19

### Added
- Workflow task editor: duplicate button to clone an existing task with all its configuration

### Fixed
- Duplicating, deleting, or reordering tasks now correctly preserves heavy prompts (>10K chars) instead of silently truncating them

## [2.5.0] - 2026-04-18

### Added
- History list: show concurrency and iteration count columns
- History detail: show input/output token counts and ratio (In:Out)
- History detail: real-time iteration progress bar for running workflows via SSE
- Backfill input/output token stats for older workflows on first access

### Changed
- Long context preset prompts: balanced for ~40:1 input-to-output token ratio with "Don't overthink this" guidance

## [2.4.6] - 2026-04-18

### Fixed
- Cache hit rate: reduced sliding window from concurrency-sized (e.g. 50) to fixed 5, keeping KV cache memory pressure realistic for large prompts

## [2.4.5] - 2026-04-18

### Fixed
- Cache hit rate: reuse now picks from a sliding window of recent prefixes (sized to concurrency) instead of the entire pool, avoiding stale entries that inference engines (SGLang, vLLM) may have evicted under memory pressure

## [2.4.4] - 2026-04-18

### Changed
- Cache hit rate: replaced fixed-K-prefixes + shuffle with per-request Bernoulli scheduling — each request independently rolls miss/hit with the target probability, producing a uniform distribution throughout the run instead of clustering all misses at the start

## [2.4.3] - 2026-04-18

### Fixed
- Cache hit rate: `targetCacheHitRate` was silently dropped by both the benchmark and workflow route handlers — the field was validated but never passed to the engine, so the feature had no effect

## [2.4.2] - 2026-04-18

### Fixed
- Cache hit rate: prefix size now adapts to prompt length (~5%, clamped 128–4096 chars) to avoid inflating short prompts — previously a fixed ~4 KB prefix would double a 1K-token input

## [2.4.1] - 2026-04-18

### Fixed
- Cache hit rate: replaced short UUID prefix (~5 tokens) with ~1024-token random prefix to reliably bust block-level KV cache on inference engines (vLLM, SGLang, etc.)
- Cache hit rate: replaced round-robin variant assignment with Fisher–Yates shuffled schedule so cache misses are spread evenly across the run instead of clustered at the start

## [2.4.0] - 2026-04-18

### Added
- Cache hit rate control (`targetCacheHitRate`): prepends unique UUID prefixes to each request to simulate realistic multi-user traffic with configurable prefix-cache hit rate (0–99%). Available as a toggle + percentage input in the WorkflowConfigPanel Advanced section. Formula: K = iterations × (1 − rate) unique variants, cycled round-robin.

## [2.3.0] - 2026-04-18

### Changed
- Raised concurrency limit from 50 to 200 and iterations limit from 1000 to 2000
- Replaced batch-based concurrency with sliding-window worker pool to maintain steady in-flight request count — previously, requests that completed early left slots idle causing actual concurrency to drop over time; now a new request starts immediately whenever one finishes

## [2.2.0] - 2026-04-17

### Added
- Long Context 150K preset: a new built-in prompt preset (~150,000 tokens) bridging the gap between the existing 64K and 256K presets. Available in ConfigPanel, WorkflowConfigPanel, and PlaygroundPage. Loaded on demand via dynamic import to avoid bundle size impact.

## [2.1.0] - 2026-04-16

### Added
- `maxQps` parameter for workflow tasks: global token bucket rate limiting across all concurrent slots. Set to a positive integer to cap requests per second; `0` means unlimited. Available in the WorkflowConfigPanel Advanced section with quick-select buttons (Off / 1 / 5 / 10).
- Token bucket implementation in the benchmark engine with cancellation support — rate limiting integrates cleanly with existing cancel flow and does not affect `requestInterval` or `concurrency` behavior.

## [2.0.0] - 2026-04-13

### Security
- Eliminated all hardcoded secrets: JWT secret, encryption key, and salt are now auto-generated and persisted to `data/` directory
- Force password change on first login with default credentials (`changeme`)
- Restricted CORS to configured origin (default: same-origin only)
- Added login rate limiting (5 attempts per 5 minutes per IP)
- Added Helmet security headers with Content Security Policy
- Moved auth verify and change-password endpoints behind authentication middleware
- Replaced JWT-in-query-string with short-lived one-time tokens for SSE and download URLs
- New password must differ from current password when changing
- JWT token storage moved from `localStorage` to `sessionStorage`

### Added
- Zod schema validation for all API request bodies with descriptive error messages
- `ProviderConfigUpdateSchema` for partial provider updates
- `POST /api/auth/change-password` endpoint
- `POST /api/auth/sse-token` endpoint for one-time token exchange
- Shared SQLite connection singleton with WAL mode and busy timeout
- CSV escaping utility to prevent injection in exports
- Express Request type augmentation (`req.user`)
- 5 new test suites: encryption, auth middleware, validation schemas, benchmark engine, store sync (65 backend tests total)

### Changed
- SQLite-first write pattern across all stores: DB writes before in-memory Map updates to prevent inconsistency on failures
- Encryption migration runs synchronously before server startup to prevent race conditions
- Monitor cleanup runs daily at 3am with 7-day retention
- `cancelledRuns` cleanup in benchmark engine on both success and error paths
- PRAGMA `table_info` migration pattern replaces try/catch `ALTER TABLE`
- `apiKeys` field in benchmark and workflow schemas is now optional with empty default
- `supportsVision`/`supportsTools` use nullish coalescing (`??`) instead of logical OR

### Fixed
- Encryption migration race condition — server could accept requests before migration completed
- `store.delete()` violated SQLite-first pattern (deleted Map before DB)
- `PUT /api/providers/:id` had no input validation
- Monitor error responses returned HTTP 200 instead of 500
- Provider test endpoints could crash the server on connection failure (now returns 502)
- Workflow error recovery could overwrite cancellation status
- Frontend infinite re-render loop on History page with running workflows
- EventSource not cleaned up on component unmount in useWorkflow hook
- Missing `pageConfig` fallback for unknown routes
- Redundant `method`/`action` attributes on login form

### Removed
- Dead code: `backend/src/services/store-old.ts`

## [1.3.3] - 2026-04-13

### Changed
- Merged Docker publish into CI pipeline — Docker image build now requires all quality checks to pass first
- CI workflow also triggers on version tags so quality gate runs before Docker push

### Fixed
- CI lint warnings: cleaned up unused imports/variables across frontend and backend
- Upgraded GitHub Actions to v5 (Node.js 24 compatible)
- Root docs (CHANGELOG, README, docker-compose) excluded from Prettier formatting
- lint-staged glob expanded to cover config `.js` files

## [1.3.2] - 2026-04-13

### Added
- Vitest test framework with initial test suites (frontend: tokenCount, MonitorPage helpers; backend: MonitorStore CRUD)
- Prettier for consistent code formatting across frontend and backend
- ESLint for backend (flat config, typescript-eslint)
- Husky pre-commit hook with lint-staged (auto-format on commit)
- GitHub Actions CI pipeline: typecheck, lint, format check, tests, build
- `scripts/release.sh` for automated version bump, changelog update, tag, and push

### Fixed
- 11 TypeScript type errors across the codebase (ResultsPanel JSX, App.tsx, WorkflowResults, etc.)
- CI error messages now show specific failures and actionable fix instructions

## [1.3.1] - 2026-04-10

### Added
- Monitor trend charts: expandable TTFT, TPS, and Latency time-series graphs per model with 1h/6h/24h range selector and threshold reference lines

### Fixed
- Playground history: clicking a failed history entry no longer crashes (undefined metrics guard)
- Playground history: selecting a record whose provider was deleted no longer causes a blank screen (graceful fallback to empty provider selection)

## [1.3.0] - 2026-04-09

### Added
- Monitor health classification now based on TPS (tokens per second) instead of raw latency
- Monitor probe prompt upgraded to generate longer responses for accurate TPS measurement
- Provider deletion cascades to monitor targets cleanup
- Provider model rename auto-syncs monitor targets (preserves monitoring config)
- Anthropic streaming fallback: read `input_tokens` from `message_delta` for LiteLLM compatibility

### Changed
- Monitor health thresholds: `latencySlowMs`/`latencyVerySlowMs` replaced with `tpsSlowThreshold` (default 20) / `tpsVerySlowThreshold` (default 5)
- Monitor UI tooltips show TPS instead of latency as primary metric
- Workflow templates default `warmupRuns` changed from 2 to 0
- Quick Benchmark and Workflow config default `warmupRuns` changed from 2 to 0

### Fixed
- `formatNumber` crash when token values are undefined (WorkflowResults page)
- Workflow detail table showing Tokens as 0 (field mismatch: `promptTokens` vs `totalTokens`)
- Orphaned monitor targets remaining after provider model rename or deletion

## [1.2.1] - 2026-04-07

### Changed
- Playground image input redesigned: inline button at prompt bottom, drag-and-drop, clipboard paste support (matching ChatGPT/Claude UX)
- Playground Run button moved to prompt textarea bottom-right for faster access
- Config row (Max Tokens, Streaming, Thinking) moved above prompt area
- Presets integrated into prompt bottom bar
- Removed URL image input (file upload only)

## [1.2.0] - 2026-04-07

### Added
- Playground history with SQLite persistence, auto-save on every run
- History sidebar with replay: click any past run to restore prompt, config, and response
- Thinking/reasoning toggle for Anthropic extended thinking and OpenAI reasoning effort
- Copy response button in Playground
- Long Context presets (8K/16K/32K/64K/128K) in Playground
- Backend image validation (size and count limits)

### Fixed
- Anthropic extended thinking not working (wrong API version, missing thinking params)
- Anthropic required CLI headers accidentally removed
- Playground upstream API calls not aborted when client disconnects (resource leak)
- Gemini using fake conversation turns instead of native `systemInstruction`
- Playground `/run` returning HTTP 200 on errors instead of 502
- Image URLs silently dropped for Anthropic/Gemini (now fetched and converted to base64)
- Backend `maxTokens` default misaligned (512 vs 4096)
- Flash of empty state on Monitor, Config, and Workflow pages before data loads

### Changed
- History sidebar defaults to open for better discoverability
- Playground design polish: label sizes, config row layout, mobile responsiveness

## [1.1.0] - 2026-04-04

### Added
- Gemini streaming support (`streamGenerateContent` with `alt=sse`) for accurate TTFT measurement
- Gemini streaming in Playground with real-time token output
- History page refresh button for manual data reload
- Auto-refresh History page every 30s when running workflows exist
- Reload workflow data when navigating to History page

### Fixed
- Gemini TTFT always showing 0 due to missing streaming implementation
- Playground non-streaming TTFT showing fabricated value (`responseTime * 0.3`) instead of N/A
- Playground Gemini image input not being passed to API (images were silently dropped)
- Playground Gemini format falling back to non-streaming instead of using native streaming
- Frontend TTFT displaying `0ms` instead of `N/A` for non-streaming requests (WorkflowResults, ResultsPanel, PlaygroundPage)
- Non-streaming `/run` endpoint not passing images parameter to provider

### Changed
- `backend/public/` added to `.gitignore` (build artifact)

## [1.0.3] - 2026-04-04

### Changed
- Renamed project from LLM Benchmark to LLM API Radar
- Updated all UI references, branding, screenshots, and demo GIF

## [1.0.0] - 2026-04-04

Initial release.

### Features
- Multi-provider benchmark engine (OpenAI, Anthropic, Gemini, OpenAI-Compatible)
- Workflow engine with multi-task sequential execution
- Per-task prompt, concurrency, and iteration configuration
- Warmup runs to eliminate cold-start bias
- Live streaming metrics with per-provider area charts
- Radar comparison across all dimensions
- Persistent run history with full result details
- JSON and CSV export
- Playground page with streaming, vision support, and image upload
- Monitor page with periodic health checks, configurable thresholds, and 24h history
- JWT-based authentication with configurable credentials
- Docker deployment with multi-stage alpine build
- One-click build script (`start.sh`) and Docker Compose
- GitHub Actions workflow for Docker Hub auto-publish on tag push
- Dark theme UI with Ant Design 5
- SQLite storage with single-file database
