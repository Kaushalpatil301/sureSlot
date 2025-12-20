import { BookingIntent } from "../models/bookingIntent.model.js";
import { expireBookingIntent } from "../services/payment.service.js";

/**
 * Release Expired Intents Job
 *
 * WHY BACKGROUND JOB:
 * - Intents expire automatically after timeout
 * - Need to mark them as EXPIRED in database
 * - Release "soft holds" on slots
 * - Cleanup stale data
 * - Cannot rely on user action (user might close browser)
 *
 * HOW THIS MODELS REAL-WORLD BEHAVIOR:
 *
 * 1. ABANDONED CART SCENARIO:
 *    - User adds to cart, starts checkout
 *    - Gets distracted, closes browser
 *    - Item should return to inventory automatically
 *    - Same with appointment slots
 *
 * 2. PAYMENT TIMEOUT:
 *    - Payment gateway has timeout (typically 10-15 min)
 *    - User might leave payment page open
 *    - After timeout, slot should be available again
 *    - Background job handles this cleanup
 *
 * 3. FAIRNESS:
 *    - Prevents slots being held indefinitely
 *    - Next user can book after timeout
 *    - Automatic inventory management
 *    - No manual intervention needed
 *
 * 4. SYSTEM RELIABILITY:
 *    - Doesn't depend on user closing browser
 *    - Doesn't depend on payment gateway callback
 *    - Server-side enforcement of timeout
 *    - Guarantees eventual consistency
 */

/**
 * Releases expired booking intents
 *
 * WHEN TO RUN:
 * - Every 1-5 minutes (configurable)
 * - More frequent = faster slot release
 * - Less frequent = lower DB load
 *
 * WHAT IT DOES:
 * 1. Find intents where: status=PENDING AND expiresAt <= now
 * 2. Mark each as EXPIRED
 * 3. Slot becomes available again (no decrement needed, never incremented)
 *
 * WHY BATCH PROCESSING:
 * - Process multiple intents in one job run
 * - Efficient DB queries
 * - Limits impact on DB performance
 *
 * @param {Number} batchSize - Number of intents to process per run
 * @returns {Object} Job execution result
 */
export const releaseExpiredIntents = async (batchSize = 100) => {
  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;

  try {
    console.log(`🕐 [Job] Starting expired intents cleanup...`);

    // Find expired intents
    // WHY static method:
    // - Encapsulates query logic
    // - Reusable across codebase
    // - Consistent query pattern
    const expiredIntents = await BookingIntent.findExpiredIntents(batchSize);

    if (expiredIntents.length === 0) {
      console.log(`✅ [Job] No expired intents found`);
      return {
        success: true,
        processed: 0,
        errors: 0,
        duration: Date.now() - startTime,
      };
    }

    console.log(`📋 [Job] Found ${expiredIntents.length} expired intents`);

    // Process each intent
    // WHY sequential processing:
    // - Each expiration is independent
    // - One failure doesn't stop others
    // - Easier error tracking
    // - Background job, speed not critical
    for (const intent of expiredIntents) {
      try {
        await expireBookingIntent(intent._id.toString());
        processedCount++;
      } catch (error) {
        errorCount++;
        console.error(
          `❌ [Job] Failed to expire intent ${intent._id}:`,
          error.message
        );
        // Continue processing other intents
        // WHY continue:
        // - One error shouldn't stop cleanup
        // - Other intents still need processing
        // - Will retry in next job run
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `✅ [Job] Expired intents cleanup completed: ${processedCount} processed, ${errorCount} errors, ${duration}ms`
    );

    return {
      success: true,
      processed: processedCount,
      errors: errorCount,
      duration,
    };
  } catch (error) {
    console.error(`💥 [Job] Fatal error in expired intents cleanup:`, error);
    return {
      success: false,
      processed: processedCount,
      errors: errorCount + 1,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
};

/**
 * Starts the expired intents cleanup job
 *
 * DEPLOYMENT OPTIONS:
 *
 * 1. CRON (Production):
 *    - Use system cron or cloud scheduler
 *    - More reliable than in-process
 *    - Example: * /5 * * * * (every 5 minutes)
 *
 * 2. Node Cron (Development):
 *    - Use node-cron package
 *    - In-process scheduling
 *    - Good for development/testing
 *
 * 3. Queue System (Scale):
 *    - Use Redis/RabbitMQ with Bull/BullMQ
 *    - Distributed job processing
 *    - Better for multiple servers
 *
 * @param {Number} intervalMinutes - How often to run (default: 5 minutes)
 */
export const startExpiredIntentsJob = (intervalMinutes = 5) => {
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(
    `🚀 [Job] Starting expired intents cleanup job (every ${intervalMinutes} minutes)`
  );

  // Run immediately on startup
  // WHY run immediately:
  // - Clean up any intents that expired during downtime
  // - Don't wait for first interval
  // - Faster recovery after restart
  releaseExpiredIntents();

  // Schedule recurring job
  // WHY setInterval:
  // - Simple and built-in
  // - Good for development
  // - Use cron or queue system in production
  setInterval(() => {
    releaseExpiredIntents();
  }, intervalMs);

  // WHY not use cron in code:
  // - In production, use external scheduler (AWS EventBridge, GCP Cloud Scheduler, cron)
  // - Prevents multiple instances from running same job
  // - Better observability and monitoring
  // - Can pause/resume without code deploy
};

/**
 * Alternative: Manual trigger for testing
 *
 * WHY manual trigger:
 * - Testing in development
 * - Admin can trigger cleanup manually
 * - Debug issues with specific intents
 *
 * Usage: Call from admin endpoint or console
 */
export const manualCleanup = async () => {
  console.log(`🔧 [Manual] Triggering expired intents cleanup...`);
  return await releaseExpiredIntents();
};

export default {
  releaseExpiredIntents,
  startExpiredIntentsJob,
  manualCleanup,
};
