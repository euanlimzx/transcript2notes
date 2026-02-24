#!/bin/bash
set -e

echo "🚀 Setting up Transcript2Notes..."

# Check if Python venv exists, create if not
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv .venv
fi

# Activate venv
echo "🔌 Activating Python virtual environment..."
source .venv/bin/activate

# Install Python dependencies
echo "📥 Installing Python dependencies..."
pip install -q -r requirements.txt

# Install Node dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📥 Installing Node dependencies..."
    npm install
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Copy .env.example to .env and set GEMINI_API_KEY"
fi

echo "✅ Setup complete!"
echo ""
echo "🌐 Starting servers..."
echo "   - Next.js: http://localhost:3000"
echo "   - Python API: http://localhost:5328"
echo ""

# Ensure concurrently is installed
if ! npm list concurrently &> /dev/null; then
    echo "📦 Installing concurrently..."
    npm install --save-dev concurrently
fi

# Start both servers
npx concurrently \
    --names "NEXT,API" \
    --prefix-colors "cyan,yellow" \
    "npm run dev" \
    "npm run dev:api"
