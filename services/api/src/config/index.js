import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load root .env if available, or services/api .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const DEFAULT_DEV_JWT_SECRET = 'development_jwt_secret_must_be_overridden_in_prod';
const DEFAULT_INTERNAL_SERVICE_SECRET = 'dev_internal_service_secret_change_in_prod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Auth & Secrets
  JWT_SECRET: z.string().min(16).default(DEFAULT_DEV_JWT_SECRET),
  JWT_ISSUER: z.string().default('friday-edith-api'),
  JWT_AUDIENCE: z.string().default('friday-edith-clients'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  ACCESS_COOKIE_NAME: z.string().default('friday_access_token'),
  REFRESH_COOKIE_NAME: z.string().default('friday_refresh_token'),
  CSRF_COOKIE_NAME: z.string().default('friday_csrf_token'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),

  // Service-to-service Internal Auth & Timeouts
  INTERNAL_SERVICE_SECRET: z.string().min(16).default(DEFAULT_INTERNAL_SERVICE_SECRET),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),

  // Internal AI Microservice URLs
  FRIDAY_AI_SERVICE_URL: z.string().url().default('http://localhost:8001'),
  EDITH_ENGINE_SERVICE_URL: z.string().url().default('http://localhost:8002'),
  EDITH_RUNNER_SERVICE_URL: z.string().url().default('http://localhost:8003'),
  EDITH_WORKSPACES_DIR: z.string().default(path.resolve(__dirname, '../../../../runner-host/workspace/users'))
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  throw new Error('Environment configuration error');
}

if (parsed.data.NODE_ENV === 'production') {
  if (parsed.data.JWT_SECRET === DEFAULT_DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET must be overridden in production environment');
  }
  if (parsed.data.INTERNAL_SERVICE_SECRET === DEFAULT_INTERNAL_SERVICE_SECRET) {
    throw new Error('INTERNAL_SERVICE_SECRET must be overridden in production environment');
  }
}

export const config = {
  ...parsed.data,
  COOKIE_SECURE: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production',
  ALLOWED_ORIGINS: parsed.data.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
};

