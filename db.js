import mongoose from "mongoose";

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,  // 10s to find a server
  socketTimeoutMS: 45000,           // 45s socket timeout
  heartbeatFrequencyMS: 10000,      // check connection every 10s
  maxPoolSize: 10,
  retryWrites: true,
  retryReads: true,
};

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, MONGO_OPTIONS);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.log("❌ DB initial connection error:", err.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Auto-reconnect on disconnect
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected — reconnecting in 5s...");
  setTimeout(connectDB, 5000);
});

mongoose.connection.on("error", (err) => {
  console.log("❌ MongoDB error:", err.message);
  if (err.name === "MongoTopologyClosedError" || err.name === "MongoNetworkError") {
    console.log("🔄 Attempting reconnect...");
    setTimeout(connectDB, 5000);
  }
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

/**
 * Safe DB operation wrapper — retries once if topology is closed.
 * Use this for any critical DB call that might fail mid-session.
 */
export async function safeDB(fn) {
  try {
    return await fn();
  } catch (err) {
    if (
      err.name === "MongoTopologyClosedError" ||
      err.name === "MongoNetworkError" ||
      err.message?.includes("Topology is closed")
    ) {
      console.log("⚠️ DB topology closed — waiting for reconnect...");
      await new Promise((r) => setTimeout(r, 3000));
      return await fn(); // retry once
    }
    throw err;
  }
}
