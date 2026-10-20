import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Blank secrets win over .env (dotenv never overrides existing variables), so tests can't hit real APIs.
    env: { NODE_ENV: 'test', SEED_DEMO_USERS: 'false', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', GITHUB_TOKEN: '', MONGODB_URI: '', REDIS_URL: '' },
  },
});
