import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { Session } from '../src/models/Session';
import { User } from '../src/models/User';

const app = createApp();
let mongo: MongoMemoryServer;

const PASSWORD = 'Secret123';

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('gi_refresh='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0];
}

async function register(email = 'kavya@example.com') {
  return request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: 'Kavya' });
}

beforeAll(async () => {
  // Always use a throwaway database, even if MONGODB_URI is set in .env.
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

describe('registration and login', () => {
  it('registers a user, hashes the password and issues tokens', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'kavya@example.com', role: 'user' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(refreshCookie(res)).toMatch(/^gi_refresh=/);

    const stored = await User.findOne({ email: 'kavya@example.com' }).select('+passwordHash');
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored!.passwordHash).not.toContain(PASSWORD);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await register();
    expect((await register()).status).toBe(409);
    const weak = await request(app).post('/api/auth/register').send({ email: 'x@example.com', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with the correct password and rejects a wrong one', async () => {
    await register();
    const ok = await request(app).post('/api/auth/login').send({ email: 'KAVYA@example.com', password: PASSWORD });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: 'kavya@example.com', password: 'Wrong1234' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after five consecutive failed attempts', async () => {
    await register();
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'kavya@example.com', password: 'Wrong1234' });
      expect(res.status).toBe(401);
    }
    const fifth = await request(app).post('/api/auth/login').send({ email: 'kavya@example.com', password: 'Wrong1234' });
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');

    // Even the correct password is refused while locked.
    const locked = await request(app).post('/api/auth/login').send({ email: 'kavya@example.com', password: PASSWORD });
    expect(locked.status).toBe(423);

    // After the cooldown the correct password works again.
    await User.updateOne({ email: 'kavya@example.com' }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    const after = await request(app).post('/api/auth/login').send({ email: 'kavya@example.com', password: PASSWORD });
    expect(after.status).toBe(200);
  });
});

describe('sessions', () => {
  it('returns the current user for a valid access token and rejects guests', async () => {
    const { body } = await register();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('kavya@example.com');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  it('rotates the refresh token and detects reuse of an old one', async () => {
    const first = refreshCookie(await register());

    const rotated = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(rotated.status).toBe(200);
    const second = refreshCookie(rotated);
    expect(second).not.toBe(first);

    // Replaying the old token revokes the whole session family...
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    // ...so the newer token stops working too.
    expect((await request(app).post('/api/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('logout invalidates the refresh token', async () => {
    const cookie = refreshCookie(await register());
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('deactivated accounts lose access immediately', async () => {
    const res = await register();
    const cookie = refreshCookie(res);
    await User.updateOne({ email: 'kavya@example.com' }, { $set: { status: 'deactivated' } });

    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)).status).toBe(403);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(403);
  });
});

describe('roles', () => {
  it('restricts admin routes to administrators', async () => {
    const userRes = await register('user@example.com');
    expect((await request(app).get('/api/admin/users')).status).toBe(401);
    const forbidden = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${userRes.body.accessToken}`);
    expect(forbidden.status).toBe(403);

    await register('admin@example.com');
    await User.updateOne({ email: 'admin@example.com' }, { $set: { role: 'admin' } });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
    const allowed = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.users).toHaveLength(2);
  });

  it('reports Google sign-in as disabled when no client ID is configured', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: 'token' });
    expect(res.status).toBe(501);
  });
});
