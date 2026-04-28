#!/usr/bin/env bash
#
# Record a GIF demo of LLM API Radar.
#
# This script:
#   1. Starts the application (production build or dev mode)
#   2. Runs the Puppeteer recorder to capture a WebM screencast
#   3. Converts the WebM to an optimized GIF via ffmpeg
#   4. Cleans up server processes
#
# Prerequisites: Node.js 18+, npm, ffmpeg
#
# Usage:
#   chmod +x scripts/record-demo.sh
#   ./scripts/record-demo.sh              # production build
#   ./scripts/record-demo.sh --dev        # dev mode (skips build)
#   ./scripts/record-demo.sh --skip-server # app already running

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT="${PORT:-3001}"
FRONTEND_PORT="5173"
WEBM_FILE="${ROOT}/docs/demo.webm"
GIF_FILE="${ROOT}/docs/demo.gif"
PIDS=()
SKIP_SERVER=false
DEV_MODE=false

for arg in "$@"; do
  case "$arg" in
    --skip-server) SKIP_SERVER=true ;;
    --dev)         DEV_MODE=true ;;
  esac
done

# In dev mode, Puppeteer talks to the Vite dev server
if [ "$DEV_MODE" = true ]; then
  BASE_URL="http://localhost:${FRONTEND_PORT}"
else
  BASE_URL="http://localhost:${BACKEND_PORT}"
fi

cleanup() {
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  # Remove intermediate WebM
  rm -f "$WEBM_FILE"
}
trap cleanup EXIT

# ---- Check prerequisites ----
command -v ffmpeg >/dev/null 2>&1 || { echo "❌ ffmpeg is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1   || { echo "❌ Node.js is required but not installed."; exit 1; }

# ---- Start server ----
if [ "$SKIP_SERVER" = false ]; then
  if [ "$DEV_MODE" = true ]; then
    # Dev mode: start backend + frontend dev servers
    echo "🚀 Starting backend (dev)..."
    cd "${ROOT}/backend" && npm install --silent 2>/dev/null
    PORT="$BACKEND_PORT" npx tsx src/index.ts > /dev/null 2>&1 &
    PIDS+=($!)

    echo "🚀 Starting frontend (dev, demo mode)..."
    cd "${ROOT}/frontend" && npm install --silent 2>/dev/null
    VITE_DEMO_MODE=true npx vite --port "$FRONTEND_PORT" > /dev/null 2>&1 &
    PIDS+=($!)
  else
    # Production mode: build everything
    echo "📦 Building backend..."
    cd "${ROOT}/backend" && npm install --silent && npm run build --silent

    echo "📦 Building frontend..."
    cd "${ROOT}/frontend" && npm install --silent && npm run build --silent

    rm -rf "${ROOT}/backend/public"
    cp -r "${ROOT}/frontend/dist" "${ROOT}/backend/public"

    echo "🚀 Starting server on port ${BACKEND_PORT}..."
    cd "${ROOT}/backend"
    PORT="$BACKEND_PORT" node dist/index.js > /dev/null 2>&1 &
    PIDS+=($!)
  fi

  # Wait for server to be ready
  echo "⏳ Waiting for server at ${BASE_URL}..."
  for i in $(seq 1 60); do
    if curl -sf "${BASE_URL}" >/dev/null 2>&1; then
      echo "✅ Server is ready"
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "❌ Server did not start in time"
      exit 1
    fi
    sleep 1
  done
else
  echo "⏭️  Skipping server start (--skip-server)"
fi

# ---- Record screencast ----
echo "🎬 Recording demo..."
cd "${ROOT}/frontend"
NODE_PATH="${ROOT}/frontend/node_modules" node "${ROOT}/scripts/record-demo.mjs" --base-url "$BASE_URL"

# ---- Convert to GIF ----
echo "🎨 Converting to GIF..."
ffmpeg -y -i "$WEBM_FILE" \
  -vf "fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 \
  "$GIF_FILE" \
  2>/dev/null

GIF_SIZE=$(du -h "$GIF_FILE" | cut -f1)
echo "✅ Demo GIF created: ${GIF_FILE} (${GIF_SIZE})"

# If GIF is too large (>5MB), re-encode with lower quality
GIF_BYTES=$(stat -f%z "$GIF_FILE" 2>/dev/null || stat -c%s "$GIF_FILE" 2>/dev/null)
if [ "$GIF_BYTES" -gt 5242880 ]; then
  echo "⚠️  GIF is larger than 5MB, re-encoding with lower fps..."
  ffmpeg -y -i "$WEBM_FILE" \
    -vf "fps=6,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 \
    "$GIF_FILE" \
    2>/dev/null
  GIF_SIZE=$(du -h "$GIF_FILE" | cut -f1)
  echo "✅ Re-encoded: ${GIF_FILE} (${GIF_SIZE})"
fi

echo ""
echo "🎉 Done! GIF demo is at: docs/demo.gif"
echo "   Add it to your README with: ![Demo](docs/demo.gif)"
