import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Railway injects PORT automatically — do not set it manually in Railway vars
  PORT: z.string().default('5000').transform(Number),
  // Accept URLs with or without trailing slash; Railway domain doesn't need https:// prefix validation
  APP_URL: z.string().min(1, 'APP_URL is required'),
  CLIENT_URL: z.string().min(1, 'CLIENT_URL is required'),
  ADMIN_URL: z.string().min(1, 'ADMIN_URL is required'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // Email — Gmail SMTP (temporary until custom domain is verified)
  GMAIL_USER: z.string().email('GMAIL_USER must be a valid Gmail address'),
  GMAIL_APP_PASSWORD: z.string().min(1, 'GMAIL_APP_PASSWORD is required'),
  // Resend kept in env for future use when custom domain is verified
  RESEND_API_KEY: z.string().optional(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1, 'CLOUDINARY_CLOUD_NAME is required'),
  CLOUDINARY_API_KEY: z.string().min(1, 'CLOUDINARY_API_KEY is required'),
  CLOUDINARY_API_SECRET: z.string().min(1, 'CLOUDINARY_API_SECRET is required'),

  // Firebase
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'FIREBASE_PRIVATE_KEY is required'),

  // Paystack
  PAYSTACK_SECRET_KEY: z.string().min(1, 'PAYSTACK_SECRET_KEY is required'),
  PAYSTACK_PUBLIC_KEY: z.string().min(1, 'PAYSTACK_PUBLIC_KEY is required'),

  // Agora (optional until Phase 7)
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
  AUTH_RATE_LIMIT_MAX: z.string().default('5').transform(Number),

  // Bcrypt
  BCRYPT_SALT_ROUNDS: z.string().default('12').transform(Number),

  // CORS
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001')
    .transform((val) => val.split(',')),

  // Dev/testing: return OTP in API response (set true when SMTP is unavailable)
  EXPOSE_DEV_OTP: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
