import app from "./app.js";
import connectDB from "./config/db.js";
import env from "./config/env.js";

/**
 * Server entry point
 * Connects to database then starts Express server
 * Handles graceful shutdown on process termination
 */

const startServer = async () => {
  try {
    // Step 1: Connect to database first (fail fast if connection fails)
    await connectDB();

    // Step 2: Start Express server only after DB connection succeeds
    const server = app.listen(env.PORT, () => {
      console.log(
        `🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`
      );
      console.log(`📍 Health check: http://localhost:${env.PORT}/health`);
      console.log(`📍 API base: http://localhost:${env.PORT}/api/v1`);
    });

    // Graceful shutdown handler
    // Ensures connections are closed properly before exit
    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Closing server gracefully...`);

      server.close(() => {
        console.log("✅ HTTP server closed");
        // MongoDB connection will be closed by db.js SIGINT handler
        process.exit(0);
      });

      // Force shutdown after 10 seconds if graceful shutdown fails
      setTimeout(() => {
        console.error("⚠️  Forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    // Listen for termination signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("💥 UNCAUGHT EXCEPTION:", error);
      gracefulShutdown("uncaughtException");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 UNHANDLED REJECTION at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

// Start the server
startServer();
