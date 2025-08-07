#!/bin/bash

# Start Claude Code Bridge Service
# This script starts the bridge service that connects the Docker backend to local Claude Code

echo "🌉 Starting Claude Code Bridge Service"
echo "🔗 Backend: http://localhost:3001"
echo "🎯 Bridge: http://localhost:8080"
echo ""

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Start the bridge service with Bun
bun run bridge.ts --port 8080 --backend http://localhost:3001