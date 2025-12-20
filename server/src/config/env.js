import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const result = dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

if (result.error && process.env.NODE_ENV === "production") {
  throw new Error("❌ .env file not found in production");
}

const env = {
  
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "5000", 10),

  MONGODB_URI: process.env.MONGODB_URI,

  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  RATE_LIMIT_WINDOW_MS: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || "900000",
    10
  ), 
  RATE_LIMIT_MAX_REQUESTS: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || "100",
    10
  ),

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM,

  PAYMENT_GATEWAY: process.env.PAYMENT_GATEWAY || "stripe",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,

  BOOKING_INTENT_EXPIRY_MINUTES: parseInt(
    process.env.BOOKING_INTENT_EXPIRY_MINUTES || "15",
    10
  ),
};

const requiredEnvVars = ["MONGODB_URI", "JWT_SECRET"];

const missingEnvVars = requiredEnvVars.filter((key) => !env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `❌ Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

export default env;
