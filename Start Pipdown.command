#!/bin/zsh
set -e

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "YOUR-MAC-IP")"

echo "Starting Pipdown:"
echo "  Mac:   http://localhost:8000"
echo "  Phone: http://${LAN_IP}:8000"
echo ""
echo "Your phone must be on the same Wi-Fi network."

npm run dev -- --host 0.0.0.0 --port 8000
