#!/bin/bash
set -e

# Run from repo root (directory containing this script)
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "🚀 Transcript2Notes – local setup"
echo ""

# --- Python backend ---
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "🔌 Activating virtual environment..."
# shellcheck source=/dev/null
source "$ROOT/.venv/bin/activate"

echo "📥 Installing Python dependencies..."
pip install -q -r requirements.txt

# --- Node frontend ---
if [ ! -d "node_modules" ]; then
    echo "📥 Installing Node dependencies..."
    npm install
fi

if [ ! -f ".env" ]; then
    echo "⚠️  No .env found. Copy .env.example to .env and set GEMINI_API_KEY (and Supabase keys if needed)."
fi

echo ""
echo "✅ Setup complete"
echo "   Frontend (Next.js): http://localhost:3000"
echo "   Backend (FastAPI):  http://127.0.0.1:5328"
echo ""

# Use venv’s uvicorn so the API always runs with the venv (concurrently subprocesses don’t inherit activation)
UVICORN="$ROOT/.venv/bin/uvicorn"
if [ ! -x "$UVICORN" ]; then
    echo "❌ Missing or not executable: $UVICORN"
    exit 1
fi

if ! npm list concurrently &>/dev/null; then
    echo "📦 Installing concurrently..."
    npm install --save-dev concurrently
fi

# INNGEST_DEV=1 so the backend registers with the Inngest dev server
export INNGEST_DEV=1

npx concurrently \
    --names "next,api,inngest" \
    --prefix-colors "cyan,yellow,magenta" \
    "npm run dev" \
    "$UVICORN api:app --reload --port 5328" \
    "npx inngest-cli@latest dev -u http://localhost:3000/api/inngest"
