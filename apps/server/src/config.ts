import 'dotenv/config';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function secret(name: string, devFallback: string): string {
  const value = env[name] || (isProd ? undefined : devFallback);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const DEFAULT_MODELS = { gemini: 'gemini-3.5-flash-lite', anthropic: 'claude-opus-5-5', none: '' } as const;

/** The configured AI provider, or "none" when its API key is missing. */
function llmProvider(): keyof typeof DEFAULT_MODELS {
  const choice = (env.LLM_PROVIDER || (env.GEMINI_API_KEY ? 'gemini' : 'anthropic')).toLowerCase();
  if (choice === 'gemini' && env.GEMINI_API_KEY) return 'gemini';
  if (choice === 'anthropic' && env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'none';
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
  // Proxies in front of the API (Render = 1; Vercel forwarding to Render = 2), so req.ip is the real visitor.
  trustProxy: Number(env.TRUST_PROXY ?? 1),
  redisUrl: env.REDIS_URL ?? '',
  githubToken: env.GITHUB_TOKEN ?? '',
  githubTimeoutMs: 8000,
  metadataTtlSec: Number(env.METADATA_TTL_SECONDS ?? 15 * 60),
  analyticsTtlSec: Number(env.ANALYTICS_TTL_SECONDS ?? 60 * 60),
  // GitHub answers 202 while it computes statistics; wait between retries (none in tests).
  statsRetryDelayMs: env.NODE_ENV === 'test' ? 0 : 1500,
  // AI insights: whichever provider is chosen needs its key; without one the AI tabs show a fallback.
  llmProvider: llmProvider(),
  llmModel: env.LLM_MODEL || DEFAULT_MODELS[llmProvider()],
  geminiApiKey: env.GEMINI_API_KEY ?? '',
  // Leaves headroom inside the SRS 10-second target for the GitHub calls that gather inputs.
  // Free-tier Gemini queues requests (5–18 s observed), so it gets more room; results are cached after the first call.
  aiTimeoutMs: Number(env.AI_TIMEOUT_MS || (llmProvider() === 'gemini' ? 25_000 : 9000)),
  alertIntervalMinutes: Number(env.ALERT_INTERVAL_MINUTES ?? 60),
  // In development the API process also runs the background jobs, since the in-memory database can't be shared.
  runWorkerInApi: (env.RUN_WORKER_IN_API ?? (isProd ? 'false' : 'true')) === 'true',
};
