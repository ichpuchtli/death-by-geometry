#!/usr/bin/env bash
# Playwright test runner for Death by Geometry
# Usage: ./tests/playwright.sh [flow-file|tag|all|screenshot] [flags]
#
# Examples:
#   ./tests/playwright.sh                    # run all flows (headed — WebGL works)
#   ./tests/playwright.sh smoke              # run flows tagged 'smoke'
#   ./tests/playwright.sh dom                # run flows tagged 'dom'
#   ./tests/playwright.sh screenshot         # take a screenshot
#   ./tests/playwright.sh screenshot --name menu-check
#   ./tests/playwright.sh all --headless     # run all flows without visible browser
#   ./tests/playwright.sh --dev              # use running dev server (port 5173)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
TESTS="$ROOT/tests"
SCREENSHOTS="$TESTS/screenshots"
PORT=4173
HEADLESS=""
USE_DEV=""
SCREENSHOT_NAME=""
TARGET="${1:-all}"
SERVER_PID=""

mkdir -p "$SCREENSHOTS"

# Parse flags
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headless) HEADLESS="1"; shift ;;
    --headed) shift ;; # headed is now the default, accept flag for backwards compat
    --dev) USE_DEV="1"; PORT=5173; shift ;;
    --name) SCREENSHOT_NAME="$2"; shift 2 ;;
    --base-url) PORT=""; shift 2 ;; # handled below
    *) shift ;;
  esac
done

BASE_URL="http://localhost:$PORT"

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Install test deps if missing
install_deps() {
  cd "$WEB"
  local need_install=0
  if ! node -e "require('playwright')" 2>/dev/null; then need_install=1; fi
  if ! node -e "require('yaml')" 2>/dev/null; then need_install=1; fi
  if ! node -e "require('tsx')" 2>/dev/null; then need_install=1; fi

  if [[ $need_install -eq 1 ]]; then
    echo "Installing test dependencies..."
    npm install --save-dev playwright yaml tsx 2>&1 | tail -1
    npx playwright install chromium 2>&1 | tail -3
  fi
  cd "$ROOT"
}

# Build and start preview server (skipped with --dev)
start_server() {
  if [[ -n "$USE_DEV" ]]; then
    # Check if dev server is already running
    if curl -s "$BASE_URL" >/dev/null 2>&1; then
      echo "Using running dev server at $BASE_URL"
      return
    fi
    echo "Starting dev server on port $PORT..."
    cd "$WEB"
    npx vite --port "$PORT" &>/dev/null &
    SERVER_PID=$!
    cd "$ROOT"
  else
    echo "Building..."
    cd "$WEB"
    npm run build --silent 2>&1 | tail -2
    echo "Starting preview server on port $PORT..."
    npx vite preview --port "$PORT" &>/dev/null &
    SERVER_PID=$!
    cd "$ROOT"
  fi

  # Wait for server to be ready
  local attempts=0
  while ! curl -s "$BASE_URL" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [[ $attempts -gt 30 ]]; then
      echo "ERROR: Server failed to start"
      exit 1
    fi
    sleep 0.2
  done
  echo "Server ready at $BASE_URL"
}

# Quick screenshot mode (always headed for WebGL)
take_screenshot() {
  local name="${SCREENSHOT_NAME:-screenshot-$(date +%Y%m%d-%H%M%S)}"

  cd "$WEB"
  node -e "
    const { chromium } = require('playwright');
    (async () => {
      const browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist'],
      });
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto('${BASE_URL}/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '${SCREENSHOTS}/${name}.png' });
      const info = await page.evaluate(() => {
        const boxes = {};
        for (const id of ['game', 'hud', 'desktop-settings']) {
          const el = document.getElementById(id);
          if (el) {
            const r = el.getBoundingClientRect();
            boxes[id] = {
              x: Math.round(r.x), y: Math.round(r.y),
              w: Math.round(r.width), h: Math.round(r.height),
              display: getComputedStyle(el).display
            };
          }
        }
        return boxes;
      });
      console.log(JSON.stringify(info, null, 2));
      await browser.close();
    })();
  "
  cd "$ROOT"
  echo "Screenshot: $SCREENSHOTS/${name}.png"
}

# Run test flows (execute from web/ so node_modules resolve correctly)
run_flows() {
  cd "$WEB"
  local env_vars="NODE_PATH=$WEB/node_modules"
  [[ -n "$HEADLESS" ]] && env_vars="$env_vars HEADLESS=1"

  env $env_vars npx tsx "$TESTS/run-flow.ts" "$TARGET" --base-url "$BASE_URL"
  cd "$ROOT"
}

# ── Main ──

install_deps
start_server

if [[ "$TARGET" == "screenshot" ]]; then
  take_screenshot
else
  run_flows
fi
