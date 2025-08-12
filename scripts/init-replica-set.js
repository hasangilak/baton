// MongoDB replica set initialization script for development
// This enables transactions required by Prisma

print("🚀 Initializing MongoDB replica set for development...");

try {
  // Initialize replica set
  var config = {
    "_id": "rs0",
    "version": 1,
    "members": [
      {
        "_id": 0,
        "host": "mongodb:27017",
        "priority": 1
      }
    ]
  };
  
  var result = rs.initiate(config);
  print("✅ Replica set initialization result:", JSON.stringify(result));
  
  // Wait for replica set to be ready
  print("⏳ Waiting for replica set to become primary...");
  
  var timeout = 30; // 30 seconds timeout
  var count = 0;
  
  while (count < timeout) {
    try {
      var status = rs.status();
      if (status.myState === 1) {
        print("✅ Replica set is now PRIMARY");
        break;
      }
    } catch (e) {
      // Ignore errors while waiting for replica set
    }
    
    sleep(1000); // Wait 1 second
    count++;
  }
  
  if (count >= timeout) {
    print("❌ Timeout waiting for replica set to become primary");
  } else {
    print("🎉 MongoDB replica set successfully configured!");
    print("💡 Transactions are now enabled for Prisma operations");
  }
  
} catch (error) {
  print("❌ Error initializing replica set:", error.message);
  
  // Check if replica set is already initialized
  try {
    var status = rs.status();
    print("ℹ️  Replica set already exists:", status.set);
  } catch (e) {
    print("❌ Failed to check replica set status:", e.message);
  }
}