import mongoose from "mongoose";
import env from "./env.js";

const connectDB = async () => {
  try {

    const options = {
      
      serverSelectionTimeoutMS: env.NODE_ENV === "production" ? 5000 : 10000,
      
      socketTimeoutMS: 45000,
    };

    const connectionInstance = await mongoose.connect(env.MONGODB_URI, options);

    console.log(
      `✅ MongoDB Connected: ${connectionInstance.connection.host} | DB: ${connectionInstance.connection.name}`
    );

    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️  MongoDB disconnected");
    });

    process.on("SIGINT", async () => {
      await mongoose.connection.close();
      console.log("🛑 MongoDB connection closed due to app termination");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ MongoDB connection FAILED:", error.message);

    process.exit(1);
  }
};

export default connectDB;
 
