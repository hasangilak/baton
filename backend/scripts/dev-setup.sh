#!/bin/bash

# Development setup script for Baton backend
# This ensures Prisma client is always in sync with schema

set -e  # Exit on any error

echo "🚀 Starting Baton Backend Development Setup"

# Function to print with timestamp
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Check if we're in Docker
if [ -f /.dockerenv ]; then
    log "📦 Running inside Docker container"
else
    log "💻 Running on host system"
fi

# Install dependencies if node_modules doesn't exist or package-lock.json is newer
if [ ! -d "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
    log "📦 Installing/updating dependencies..."
    npm install
    log "✅ Dependencies installed"
else
    log "✅ Dependencies are up to date"
fi

# Always regenerate Prisma client to ensure it's in sync
log "🔧 Generating Prisma client..."
npx prisma generate

# Check if we can connect to database
log "🔍 Checking database connection..."
if npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1; then
    log "✅ Database connection successful"
else
    log "⚠️  Database connection failed - will retry on app start"
fi

# Check if database needs migration
log "🔄 Checking database migration status..."
if npx prisma migrate status 2>&1 | grep -q "Database schema is up to date"; then
    log "✅ Database schema is up to date"
elif npx prisma migrate status 2>&1 | grep -q "Following migration have not yet been applied"; then
    log "⚠️  Database migrations needed - run 'npx prisma migrate dev' manually if needed"
else
    log "🔄 Database migration status unclear - continuing anyway"
fi

log "✅ Development setup complete!"
log "🎯 Starting application..."

# Start the application
exec "$@"