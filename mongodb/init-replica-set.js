// MongoDB Replica Set Initialization Script
// This script ensures the replica set is initialized properly on container startup

print("🔧 Starting MongoDB replica set initialization...");

// Wait for MongoDB to be ready
print("⏳ Waiting for MongoDB to be ready...");
sleep(3000);

// Check if replica set is already initialized
try {
  var status = rs.status();
  if (status.ok === 1) {
    print("✅ Replica set already initialized");
    print("Current primary:", status.members.find(m => m.stateStr === "PRIMARY").name);
    quit(0);
  }
} catch(e) {
  print("🔧 Replica set not initialized, proceeding with initialization...");
}

try {
  // Initialize replica set with single member
  var result = rs.initiate({
    _id: "rs0",
    version: 1,
    members: [
      { 
        _id: 0, 
        host: "mongodb:27017",
        priority: 1
      }
    ]
  });
  
  if (result.ok === 1) {
    print("✅ Replica set initialized successfully");
    
    // Wait for replica set to become primary
    print("⏳ Waiting for replica set to become primary...");
    var attempts = 0;
    var maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        var status = rs.status();
        if (status.ok === 1) {
          var primary = status.members.find(m => m.stateStr === "PRIMARY");
          if (primary) {
            print("✅ Replica set is now PRIMARY:", primary.name);
            break;
          }
        }
        sleep(1000);
        attempts++;
      } catch(e) {
        sleep(1000);
        attempts++;
      }
    }
    
    if (attempts >= maxAttempts) {
      print("⚠️ Warning: Replica set initialized but didn't become PRIMARY within timeout");
    }
    
  } else {
    print("❌ Failed to initialize replica set:", JSON.stringify(result));
    quit(1);
  }
} catch(e) {
  print("❌ Error initializing replica set:", e.toString());
  quit(1);
}

print("🎉 MongoDB replica set initialization complete!");