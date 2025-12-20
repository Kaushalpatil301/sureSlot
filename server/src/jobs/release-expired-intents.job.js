import { BookingIntent } from "../models/bookingIntent.model.js";
import { expireBookingIntent } from "../services/payment.service.js";

export const releaseExpiredIntents = async (batchSize = 100) => {
  const startTime = Date.now();
  let processedCount = 0;
  let errorCount = 0;

  try {
    console.log(`🕐 [Job] Starting expired intents cleanup...`);

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

export const startExpiredIntentsJob = (intervalMinutes = 5) => {
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(
    `🚀 [Job] Starting expired intents cleanup job (every ${intervalMinutes} minutes)`
  );

  releaseExpiredIntents();

  setInterval(() => {
    releaseExpiredIntents();
  }, intervalMs);

};

export const manualCleanup = async () => {
  console.log(`🔧 [Manual] Triggering expired intents cleanup...`);
  return await releaseExpiredIntents();
};

export default {
  releaseExpiredIntents,
  startExpiredIntentsJob,
  manualCleanup,
};
