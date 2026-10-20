import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function secret(name: string, devFallback: string): string {
  const value = env[name] || (isProd ? undefined : devFallback);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  isProd,
  isTest: env.NODE_ENV === 'test',
  port: Number(env.PORT ?? 4000),
  mongoUri: env.MONGODB_URI ?? '',
  jwtAccessSecret: secret('JWT_ACCESS_SECRET', 'dev-only-access-secret'),
  accessTokenTtlSec: Number(env.ACCESS_TOKEN_TTL_SECONDS ?? 15 * 60),
  refreshTokenTtlSec: Number(env.REFRESH_TOKEN_TTL_SECONDS ?? 7 * 24 * 60 * 60),
  maxFailedLogins: 5,
  lockoutMinutes: Number(env.LOCKOUT_MINUTES ?? 15),
  bcryptRounds: 12,
  googleClientId: env.GOOGLE_CLIENT_ID ?? '',
  adminEmails: (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  seedDemoUsers: env.SEED_DEMO_USERS === 'true',
  corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
  redisUrl: env.REDIS_URL ?? '',
  githubToken: env.GITHUB_TOKEN ?? '',
  githubTimeoutMs: 8000,
  metadataTtlSec: Number(env.METADATA_TTL_SECONDS ?? 15 * 60),
  analyticsTtlSec: Number(env.ANALYTICS_TTL_SECONDS ?? 60 * 60),
  // GitHub answers 202 while it computes statistics; wait between retries (none in tests).
  statsRetryDelayMs: env.NODE_ENV === 'test' ? 0 : 1500,
};
