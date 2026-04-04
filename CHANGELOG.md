# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.4.0] - 2025-12-20

### Added
- Docker deployment with multi-stage alpine build
- One-click build script (`start.sh`)
- Docker Compose with SQLite volume persistence
- Single `.env` file in project root for all configuration
- GitHub Actions workflow for Docker Hub auto-publish on tag push

### Changed
- Moved `.env` from `backend/` to project root for simpler configuration

## [1.3.0] - 2025-12-18

### Added
- JWT-based authentication with configurable credentials
- Protected API routes and frontend routing
- Auto-redirect to login page on session expiry
- Login page UI

### Improved
- Monitor health status display with four-tier indicators

## [1.2.0] - 2025-12-15

### Added
- **Monitor page** — periodic health checks for provider/model combinations
  - Rich metrics per probe: TTFT, output tokens, response validation
  - Configurable health thresholds (latency, TTFT, min output tokens)
  - Per-model check intervals (5 min – 6 hours)
  - Provider-parallel, model-serial scheduling
  - 24h history bar with color-coded health status
  - Auto-refresh dashboard with summary stats
- **Playground page** — interactive prompt testing
  - Streaming and non-streaming modes
  - Vision support with image URL and file upload
  - Token counts, TTFT, TPS, and response time metrics
  - Vision Benchmark template

### Improved
- Heading scale for clearer page hierarchy
- Progress bar colors, nav tooltips, touch targets
- Read app version from `package.json` instead of hardcoding

## [1.1.0] - 2025-12-12

### Added
- Playground page with vision support and Vision Benchmark template

## [1.0.0] - 2025-12-10

### Added
- Multi-provider benchmark engine (OpenAI, Anthropic, Gemini, OpenAI-Compatible)
- Workflow engine with multi-task sequential execution
- Per-task prompt, concurrency, and iteration configuration
- Quick presets (512 / 4K / 16K tokens, 1–10 concurrency)
- Warmup runs to eliminate cold-start bias
- Live streaming metrics with per-provider area charts
- Radar comparison across all dimensions
- Persistent run history with full result details
- Side-by-side comparison of past runs
- JSON and CSV export
- Dark theme UI with Ant Design 5
- SQLite storage with single-file database
