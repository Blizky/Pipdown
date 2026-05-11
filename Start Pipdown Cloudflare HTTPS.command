#!/bin/zsh
set -e

cd "$(dirname "$0")"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Install with: brew install cloudflared"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Pipdown on local port 8000..."
npm run dev -- --host 0.0.0.0 --port 8000 > /tmp/pipdown-dev.log 2>&1 &
DEV_PID=$!

cleanup() {
  if ps -p "$DEV_PID" >/dev/null 2>&1; then
    kill "$DEV_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

sleep 2
echo ""
echo "Creating HTTPS tunnel (Cloudflare Quick Tunnel)..."
echo "Open the https://...trycloudflare.com URL on iPhone Safari."
echo ""

cloudflared tunnel --url http://localhost:8000
