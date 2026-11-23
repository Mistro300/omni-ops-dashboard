import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().default('api/v1'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MINIO_ENDPOINT: z.string().default('http://localhost:9000'),
  MINIO_ROOT_USER: z.string().default('omniops_minio'),
  MINIO_ROOT_PASSWORD: z.string().default('omniops_minio_dev_password'),
  MINIO_BUCKET_EXPORTS: z.string().default('omniops-exports'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-in-production'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-in-production'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  EXPORT_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  EXPORT_LINK_TTL_HOURS: z.coerce.number().int().min(1).default(24),
  BULK_ACTION_MAX_ITEMS: z.coerce.number().int().min(1).max(100).default(100),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(rawEnv: Record<string, unknown> = process.env): AppEnv {
  return envSchema.parse(rawEnv);
}
