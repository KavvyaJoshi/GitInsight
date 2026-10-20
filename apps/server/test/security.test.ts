import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import { Session } from '../src/models/Session';
import { User } from '../src/models/User';

const app = createApp();
let mongo: MongoMemoryServer;
const original = { allowDemoAccounts: config.allowDemoAccounts, adminEmails: config.adminEmails, googleClientId: config.googleClientId };

const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('gi_refresh='))!.split(';')[0];

/** Pretend Google verified this person. */
function googleSays(payload: { sub: string; email: string; name?: string }) {
  vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({ ...payload, email_verified: true }) } as never);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Session.deleteMany({});
});

afterEach(() => {
  Object.assign(config, original);
  vi.restoreAllMocks();
});

describe('request hygiene', () => {
  it('rejects oversized bodies with 413 instead of a server error', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x'.repeat(200_000), password: 'p' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('demo accounts in production', () => {
  async function seedDemoAdmin() {
    await User.create({ email: 'admin@gitinsight.dev', role: 'admin', hasPassword: true, passwordHash: await bcrypt.hash('Admin@1234', 4) });
  }

  it('refuses sign-in with the public demo credentials when demo accounts are disabled', async () => {
    await seedDemoAdmin();
    config.allowDemoAccounts = false;
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@gitinsight.dev', password: 'Admin@1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('also ends sessions that were opened before demo accounts were disabled', async () => {
    await seedDemoAdmin();
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@gitinsight.dev', password: 'Admin@1234' });
    expect(login.status).toBe(200);

    config.allowDemoAccounts = false;
    expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${login.body.accessToken}`)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(login))).status).toBe(403);
  });
});

describe('administrator email list', () => {
  it('does not grant admin to an unverified password sign-up', async () => {
    config.adminEmails = ['boss@example.com'];
    const res = await request(app).post('/api/auth/register').send({ email: 'boss@example.com', password: 'Secret123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });

  it('grants admin once Google has verified the address', async () => {
    config.adminEmails = ['boss@example.com'];
    config.googleClientId = 'test-client';
    googleSays({ sub: 'google-boss', email: 'boss@example.com', name: 'Boss' });
    const res = await request(app).post('/api/auth/google').send({ credential: 'signed-by-google' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});

describe('linking Google to an existing password account', () => {
  it('removes the old password and ends old sessions, so an email squatter loses access', async () => {
    // Someone registers the victim's address with their own password (sign-up doesn't verify email).
    const squatter = await request(app).post('/api/auth/register').send({ email: 'victim@example.com', password: 'Squat1234' });
    const squatterCookie = cookieOf(squatter);

    // The real owner later signs in with Google.
    config.googleClientId = 'test-client';
    googleSays({ sub: 'google-victim', email: 'victim@example.com' });
    const owner = await request(app).post('/api/auth/google').send({ credential: 'signed-by-google' });
    expect(owner.status).toBe(200);
    expect(owner.body.user).toMatchObject({ googleLinked: true, passwordSet: false });

    expect((await request(app).post('/api/auth/refresh').set('Cookie', squatterCookie)).status).toBe(401);
    const retry = await request(app).post('/api/auth/login').send({ email: 'victim@example.com', password: 'Squat1234' });
    expect(retry.status).toBe(400);
    expect(retry.body.error.code).toBe('USE_GOOGLE_SIGN_IN');
    // The owner's own fresh session keeps working.
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookieOf(owner))).status).toBe(200);
  });
});
