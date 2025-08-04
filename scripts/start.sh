#!/bin/bash

# Baton Quick Start Script

echo "🎯 Starting Baton - AI-Powered Task Manager"
echo "============================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Ask user for mode
echo "Choose startup mode:"
echo "1) Production (default)"
echo "2) Development (with hot reload)"
read -p "Enter choice (1-2): " choice

case $choice in
    2)
        echo "🚀 Starting in Development mode..."
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
        ;;
    *)
        echo "🚀 Starting in Production mode..."
        docker-compose up -d
        ;;
esac

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🔍 Checking service health..."

# Check backend
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend is not responding"
fi

# Check frontend
if curl -s http://localhost:5173/health > /dev/null; then
    echo "✅ Frontend is healthy"
else
    echo "❌ Frontend is not responding"
fi

echo ""
echo "🎉 Baton is ready!"
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend API: http://localhost:3001"
echo "📊 Health Check: http://localhost:3001/health"
echo ""
echo "To stop Baton: docker-compose down"
echo "To view logs: docker-compose logs -f"