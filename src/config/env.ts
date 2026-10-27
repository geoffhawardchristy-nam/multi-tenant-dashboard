import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('NexusTenant Enterprise Admin'),
  NEXT_PUBLIC_DEFAULT_SEED_COUNT: z.coerce.number().int().min(100).max(50000).default(10200),
  NEXT_PUBLIC_MOCK_BASE_LATENCY_MS: z.coerce.number().int().min(0).max(5000).default(40),
  NEXT_PUBLIC_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
});

export type AppEnvironment = z.infer<typeof envSchema>;

function parseEnv(): AppEnvironment {
  const raw = {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_DEFAULT_SEED_COUNT: process.env.NEXT_PUBLIC_DEFAULT_SEED_COUNT,
    NEXT_PUBLIC_MOCK_BASE_LATENCY_MS: process.env.NEXT_PUBLIC_MOCK_BASE_LATENCY_MS,
    NEXT_PUBLIC_SESSION_TTL_MINUTES: process.env.NEXT_PUBLIC_SESSION_TTL_MINUTES,
  };

  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    return envSchema.parse({});
  }
  return parsed.data;
}

export const env: AppEnvironment = parseEnv();