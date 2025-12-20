/**
 * Prisma Database Client Configuration
 *
 * WHY SINGLETON PATTERN:
 * - Prisma creates a connection pool internally
 * - Creating multiple instances wastes connections
 * - Singleton ensures one client per Node.js process
 *
 * CONNECTION POOLING:
 * - Default pool size: 10 connections
 * - Connections are reused across requests
 * - Automatic connection management
 */

import { PrismaClient } from "@prisma/client";

// Singleton instance
let prisma;

/**
 * Get Prisma Client instance
 * @returns {PrismaClient}
 */
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],

      errorFormat: "pretty",

      // Connection pool configuration
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Graceful shutdown
    process.on("beforeExit", async () => {
      await prisma.$disconnect();
    });
  }

  return prisma;
}

const db = getPrismaClient();

export default db;

/**
 * Transaction helper with timeout and isolation level
 * @param {Function} fn - Transaction callback
 * @param {Object} options - Transaction options
 * @returns {Promise}
 */
export async function withTransaction(fn, options = {}) {
  return await db.$transaction(fn, {
    timeout: options.timeout || 10000, // 10 seconds default
    isolationLevel: options.isolationLevel || "ReadCommitted",
  });
}

/**
 * Health check - verify database connection
 * @returns {Promise<boolean>}
 */
export async function checkDatabaseHealth() {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("❌ Database health check failed:", error);
    return false;
  }
}
