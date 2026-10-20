import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { resetCache } from '../src/lib/cache';
import { ActivityLog, UsageCounter } from '../src/models/Activity';
import { flushUsage } from '../src/services/activity.service';
import { AlertRule, JobLock, Notification } from '../src/models/Alerts';
import { Repository } from '../src/models/Repository';
import { Session } from '../src/models/Session';
import { User } from '../src/models/User';
import { runAlertEvaluation } from '../src/services/alerts.service';
import { toCsv, type Report } from '../src/services/export.service';

const app = createApp();
let mongo: MongoMemoryServer;
const fetchMock = vi.spyOn(globalThis, 'fetch');
const ID = 4242;

// Mutable fake GitHub so tests can move stars and publish releases between checks.
const gh = { stars: 100, release: null as string | null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function repoBody() {
  return {
    id: ID,
    name: 'widget',
    full_name: 'acme/widget',
    owner: { login: 'acme', avatar_url: '', type: 'User', html_url: '' },
    description: 'A widget',
    html_url: 'https://github.com/acme/widget',
    homepage: null,
    stargazers_count: gh.stars,
    forks_count: 3,
    subscribers_count: 2,
    open_issues_count: 4,
    language: 'TypeScript',
    license: { spdx_id: 'MIT', name: 'MIT License' },
    size: 2048,
    topics: [],
    default_branch: 'main',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    pushed_at: '2026-01-01T00:00:00Z',
    archived: false,
    fork: false,
    private: false,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([AlertRule.init(), Notification.init(), JobLock.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  gh.stars = 100;
  gh.release = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/releases/latest')) return gh.release ? json({ tag_name: gh.release }) : json({ message: 'Not Found' }, 404);
    if (url.endsWith(`/repositories/${ID}`) || url.endsWith('/repos/acme/widget')) return json(repoBody());
    if (url.includes('/languages')) return json({ TypeScript: 900, CSS: 100 });
    if (url.includes('/pulls')) return json([]);
    return json([]);
  });
  resetCache();
  await flushUsage();
  await Promise.all([User, Session, Repository, AlertRule, Notification, JobLock, ActivityLog, UsageCounter].map((m) => (m as typeof User).deleteMany({})));
});

async function signUp(email: string, role: 'user' | 'admin' = 'user') {
  await request(app).post('/api/auth/register').send({ email, password: 'Secret123' });
  if (role === 'admin') await User.updateOne({ email }, { $set: { role } });
  const res = await request(app).post('/api/auth/login').send({ email, password: 'Secret123' });
  return `Bearer ${res.body.accessToken}`;
}

async function searched(auth: string) {
  await request(app).get('/api/repositories/search').query({ owner: 'acme', repo: 'widget' }).set('Authorization', auth);
}

const notificationsFor = (auth: string) => request(app).get('/api/notifications').set('Authorization', auth);

describe('star threshold alerts', () => {
  it('notifies once when the threshold is reached, and again only after a fresh crossing', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    const created = await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'star_threshold', threshold: 150 });
    expect(created.status).toBe(201);
    expect((await notificationsFor(auth)).body.unread).toBe(0);

    gh.stars = 160;
    await runAlertEvaluation();
    await runAlertEvaluation(); // a retry or the next hourly run must not duplicate
    let list = (await notificationsFor(auth)).body;
    expect(list.unread).toBe(1);
    expect(list.notifications[0].title).toBe('acme/widget reached 150 stars');

    gh.stars = 140;
    await runAlertEvaluation();
    gh.stars = 155;
    await runAlertEvaluation();
    list = (await notificationsFor(auth)).body;
    expect(list.notifications).toHaveLength(2);
  });

  it('fires immediately when the threshold is already met at creation', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    const res = await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'star_threshold', threshold: 50 });
    expect(res.body.alert.triggered).toBe(true);
    expect((await notificationsFor(auth)).body.unread).toBe(1);
  });

  it('rejects duplicate alerts', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'new_release' });
    const dup = await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'new_release' });
    expect(dup.status).toBe(409);
  });
});

describe('new release alerts', () => {
  it('records a baseline, then notifies once per new release', async () => {
    gh.release = 'v1.0.0';
    const auth = await signUp('a@example.com');
    await searched(auth);
    const res = await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'new_release' });
    expect(res.body.alert.lastReleaseTag).toBe('v1.0.0');
    await runAlertEvaluation();
    expect((await notificationsFor(auth)).body.unread).toBe(0);

    gh.release = 'v1.1.0';
    await runAlertEvaluation();
    await runAlertEvaluation();
    const list = (await notificationsFor(auth)).body;
    expect(list.notifications).toHaveLength(1);
    expect(list.notifications[0].title).toBe('New release of acme/widget: v1.1.0');
  });

  it('skips evaluation while another process holds the lease', async () => {
    await JobLock.create({ name: 'alert-evaluation', lockedUntil: new Date(Date.now() + 60_000) });
    expect(await runAlertEvaluation()).toEqual({ skipped: true });
  });
});

describe('notifications', () => {
  it('marks notifications read and clears them', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    await request(app).post('/api/alerts').set('Authorization', auth).send({ githubId: ID, type: 'star_threshold', threshold: 10 });
    expect((await request(app).get('/api/notifications/unread-count').set('Authorization', auth)).body.unread).toBe(1);

    await request(app).post('/api/notifications/read').set('Authorization', auth).send({});
    expect((await notificationsFor(auth)).body).toMatchObject({ unread: 0, notifications: [{ read: true }] });

    await request(app).delete('/api/notifications').set('Authorization', auth);
    expect((await notificationsFor(auth)).body.notifications).toEqual([]);
  });

  it('is private to each user', async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    await searched(alice);
    await request(app).post('/api/alerts').set('Authorization', alice).send({ githubId: ID, type: 'star_threshold', threshold: 10 });
    expect((await notificationsFor(bob)).body.notifications).toEqual([]);
    const aliceAlert = (await request(app).get('/api/alerts').set('Authorization', alice)).body.alerts[0];
    expect((await request(app).delete(`/api/alerts/${aliceAlert.id}`).set('Authorization', bob)).status).toBe(404);
  });
});

describe('report export', () => {
  it('requires an account', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    expect((await request(app).post(`/api/repositories/${ID}/export`).send({ format: 'json' })).status).toBe(401);
  });

  it('downloads JSON, CSV and PDF reports', async () => {
    const auth = await signUp('a@example.com');
    await searched(auth);
    const post = (format: string) => request(app).post(`/api/repositories/${ID}/export`).set('Authorization', auth).send({ format }).buffer(true);

    const jsonRes = await post('json');
    expect(jsonRes.headers['content-type']).toMatch(/application\/json/);
    expect(jsonRes.headers['content-disposition']).toMatch(/attachment; filename="acme-widget-gitinsight-.*\.json"/);
    const report = JSON.parse(jsonRes.text);
    expect(report.repository).toMatchObject({ fullName: 'acme/widget', stars: 100 });
    expect(report.languages[0]).toMatchObject({ name: 'TypeScript', percent: 90 });

    const csvRes = await post('csv');
    expect(csvRes.headers['content-type']).toMatch(/text\/csv/);
    expect(csvRes.text.split('\n')[0]).toBe('section,metric,value');
    expect(csvRes.text).toContain('languages,TypeScript,90%');

    const pdfRes = await post('pdf').parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect((pdfRes.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    expect(await ActivityLog.countDocuments({ action: 'export.created' })).toBe(3);
    expect((await post('docx')).status).toBe(400);
  });

  it('neutralises spreadsheet formulas in CSV values', () => {
    const csv = toCsv({ repository: { description: '=HYPERLINK("x")' }, generatedAt: '', source: '' } as unknown as Report);
    expect(csv).toContain(`repository,description,"'=HYPERLINK(""x"")"`);
  });
});

describe('administration', () => {
  it('restricts admin routes to administrators', async () => {
    const user = await signUp('user@example.com');
    for (const path of ['/api/admin/usage', '/api/admin/users', '/api/admin/logs']) {
      expect((await request(app).get(path).set('Authorization', user)).status).toBe(403);
    }
  });

  it('reports platform usage and upstream API consumption', async () => {
    const admin = await signUp('admin@example.com', 'admin');
    await searched(admin);
    const res = await request(app).get('/api/admin/usage').set('Authorization', admin);
    expect(res.status).toBe(200);
    expect(res.body.platform).toMatchObject({ users: 1, admins: 1, repositories: 1 });
    expect(res.body.today.searches).toBe(1);
    expect(res.body.github.callsToday).toBeGreaterThan(0);
    expect(res.body.series).toHaveLength(14);
  });

  it('deactivates an account, ends its sessions and audits the action', async () => {
    const admin = await signUp('admin@example.com', 'admin');
    const user = await signUp('user@example.com');
    const target = await User.findOne({ email: 'user@example.com' });

    const res = await request(app).patch(`/api/admin/users/${target!._id}`).set('Authorization', admin).send({ status: 'deactivated' });
    expect(res.body.user.status).toBe('deactivated');
    expect((await request(app).get('/api/auth/me').set('Authorization', user)).status).toBe(403);
    expect(await Session.countDocuments({ userId: target!._id, revokedAt: null })).toBe(0);
    expect((await request(app).post('/api/auth/login').send({ email: 'user@example.com', password: 'Secret123' })).status).toBe(403);

    const logs = await request(app).get('/api/admin/logs').query({ action: 'admin.' }).set('Authorization', admin);
    expect(logs.body.logs[0]).toMatchObject({ action: 'admin.user.deactivate', actorEmail: 'admin@example.com', targetLabel: 'user@example.com' });
  });

  it('prevents administrators from deactivating themselves', async () => {
    const admin = await signUp('admin@example.com', 'admin');
    const self = await User.findOne({ email: 'admin@example.com' });
    expect((await request(app).patch(`/api/admin/users/${self!._id}`).set('Authorization', admin).send({ status: 'deactivated' })).status).toBe(400);
  });

  it('logs sign-ins without storing passwords', async () => {
    await signUp('a@example.com');
    const entry = await ActivityLog.findOne({ action: 'auth.login' }).lean();
    expect(entry).toMatchObject({ actorEmail: 'a@example.com' });
    expect(JSON.stringify(entry)).not.toContain('Secret123');
  });
});
