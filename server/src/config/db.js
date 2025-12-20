import mongoose from "mongoose";
import env from "./env.js";

/**
 * Establishes connection to MongoDB
 * Uses mongoose connection events to handle success/failure
 * Exits process if connection fails to prevent running without DB
 */
const connectDB = async () => {
  try {
    // Mongoose connection options
    // Note: useNewUrlParser and useUnifiedTopology are deprecated in Mongoose 6+
    const options = {
      // Server selection timeout (fail fast in production)
      serverSelectionTimeoutMS: env.NODE_ENV === "production" ? 5000 : 10000,
      // Socket timeout
      socketTimeoutMS: 45000,
    };

    // Establish connection
    const connectionInstance = await mongoose.connect(env.MONGODB_URI, options);

    console.log(
      `✅ MongoDB Connected: ${connectionInstance.connection.host} | DB: ${connectionInstance.connection.name}`
    );

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
    });

    // Graceful shutdown on process termination
    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("🛑 MongoDB connection closed due to app termination");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ MongoDB connection FAILED:", error.message);
    // Fail fast: exit if DB connection fails
    // Application should not run without database
    process.exit(1);
  }
};

export default connectDB;
 
