import app from "./app.js";
import connectDB from "./config/db.js";
import env from "./config/env.js";
import { bootstrapDemoData } from "./config/demo-bootstrap.js";

const startServer = async () => {
  try {
    await connectDB();

    await bootstrapDemoData();

    const server = app.listen(env.PORT, () => {
      console.log(
        `🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`
      );
      console.log(`📍 Health check: http://localhost:${env.PORT}/health`);
      console.log(`📍 API base: http://localhost:${env.PORT}/api/v1`);
    });

    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Closing server gracefully...`);

      server.close(() => {
        console.log("✅ HTTP server closed");

        process.exit(0);
      });

      setTimeout(() => {
        console.error("⚠️  Forcefully shutting down");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("uncaughtException", (error) => {
      console.error("💥 UNCAUGHT EXCEPTION:", error);
      gracefulShutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("💥 UNHANDLED REJECTION at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
