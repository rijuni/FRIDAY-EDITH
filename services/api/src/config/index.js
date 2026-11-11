import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env if available, or services/api .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Auth & Secrets
  JWT_SECRET: z.string().min(16).default('development_jwt_secret_must_be_overridden_in_prod'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Internal AI Microservice URLs
  FRIDAY_AI_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  EDITH_ENGINE_SERVICE_URL: z.string().url().default('http://localhost:8002'),
  EDITH_RUNNER_SERVICE_URL: z.string().url().default('http://localhost:8003')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  throw new Error('Environment configuration error');
}

export const config = parsed.data;

