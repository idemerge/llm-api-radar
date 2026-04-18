# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
