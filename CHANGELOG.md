# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

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
