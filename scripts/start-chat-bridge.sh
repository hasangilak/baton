#!/bin/bash

# Start Chat Bridge for Claude Code Integration
# This script connects your local Claude Code to Baton's chat service

echo "🤖 Baton Chat Bridge for Claude Code"
echo "======================================"
echo ""

# Check if Claude Code is installed
if ! command -v /home/hassan/.claude/local/claude &> /dev/null; then
    echo "❌ Claude Code is not installed or not in PATH"
    echo ""
    echo "Please install Claude Code first:"
    echo "  npm install -g @anthropic-ai/claude-code"
    echo ""
    echo "Or if using local installation:"
    echo "  export PATH=\"$HOME/.npm-global/bin:$PATH\""
    exit 1
fi

# Check if required npm packages are installed
if ! npm list socket.io-client &> /dev/null; then
    echo "📦 Installing required dependencies..."
    npm install socket.io-client axios
fi

# Set backend URL (can be overridden by environment variable)
BACKEND_URL=${BACKEND_URL:-"http://localhost:3001"}

echo "✅ Claude Code found"
echo "🔗 Connecting to backend: $BACKEND_URL"
echo ""
echo "Starting chat bridge..."
echo "Press Ctrl+C to stop"
echo ""

# Start the chat handler
cd "$(dirname "$0")/.." && node scripts/chat-handler.js