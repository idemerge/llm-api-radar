# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
