#!/bin/zsh
set -e

cd "$(dirname "$0")"

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
echo "Creating HTTPS tunnel (localtunnel)..."
echo "When URL appears, open it on iPhone Safari."
echo ""

npx localtunnel --port 8000
