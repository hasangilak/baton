#!/bin/bash
set -e

echo "🚀 Starting MongoDB with replica set configuration..."

# Create log directory if it doesn't exist
mkdir -p /var/log/mongodb

# Start MongoDB in background with replica set configuration
echo "📊 Starting MongoDB daemon..."
mongod \
  --replSet rs0 \
  --bind_ip_all \
  --quiet \
  --logpath /var/log/mongodb/mongod.log \
  --fork

# Function to check if MongoDB is ready
wait_for_mongodb() {
  echo "⏳ Waiting for MongoDB to be ready..."
  local attempts=0
  local max_attempts=30
  
  while [ $attempts -lt $max_attempts ]; do
    if mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
      echo "✅ MongoDB is ready!"
      return 0
    fi
    
    sleep 1
    attempts=$((attempts + 1))
    
    if [ $((attempts % 5)) -eq 0 ]; then
      echo "   Still waiting... (${attempts}/${max_attempts})"
    fi
  done
  
  echo "❌ MongoDB failed to start within ${max_attempts} seconds"
  return 1
}

# Wait for MongoDB to be ready
if wait_for_mongodb; then
  echo "🔧 Initializing replica set..."
  
  # Run the replica set initialization script
  if mongosh --quiet --file /docker-entrypoint-initdb.d/init-replica-set.js; then
    echo "✅ Replica set initialization completed successfully"
  else
    echo "⚠️ Warning: Replica set initialization script had issues (this may be normal if already initialized)"
  fi
else
  echo "❌ Failed to start MongoDB"
  exit 1
fi

echo "🎉 MongoDB setup complete! Bringing MongoDB to foreground..."

# Stop the background MongoDB process
mongosh admin --quiet --eval "db.shutdownServer({force: false})" || true
sleep 2

# Start MongoDB in foreground for Docker
echo "🚀 Starting MongoDB in foreground mode..."
exec mongod \
  --replSet rs0 \
  --bind_ip_all \
  --quiet \
  --logpath /var/log/mongodb/mongod.log