import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { Repository } from '../src/models/Repository';
import { buildActivity, percentagesSummingTo100 } from '../src/services/analytics.service';

const app = createApp();
let mongo: MongoMemoryServer;
const ID = 4242;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const fetchMock = vi.spyOn(globalThis, 'fetch');
const calledUrls = () => fetchMock.mock.calls.map((c) => String(c[0]));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  fetchMock.mockReset();
  await Repository.deleteMany({});
  await Repository.create({
    githubId: ID,
    fullName: 'acme/widget',
    fullNameLower: 'acme/widget',
    fetchedAt: new Date(),
    metadata: { id: ID, fullName: 'acme/widget', openIssues: 50, defaultBranch: 'main' },
  });
});

describe('percentagesSummingTo100', () => {
  it('rounds to one decimal and always totals exactly 100', () => {
    expect(percentagesSummingTo100([1, 1, 1])).toEqual([33.4, 33.3, 33.3]);
    for (const values of [[7, 13, 80], [1, 2, 3, 4, 5, 6, 7], [999, 1]]) {
      const sum = percentagesSummingTo100(values).reduce((a, b) => a + b, 0);
      expect(Math.round(sum * 10) / 10).toBe(100);
    }
    expect(percentagesSummingTo100([0, 0])).toEqual([0, 0]);
  });
});

describe('buildActivity', () => {
  // Week starting Sunday 2026-10-11 (UTC): Sun=1, Mon=2, Sat=3.
  const weeks = [{ week: Date.UTC(2026, 9, 11) / 1000, total: 6, days: [1, 2, 0, 0, 0, 0, 3] }];
  const activity = buildActivity(weeks, new Date(Date.UTC(2026, 9, 20, 15)));

  it('covers a zero-filled 52-week daily window ending today', () => {
    expect(activity.days).toHaveLength(364);
    expect(activity.windowEnd).toBe('2026-10-20');
    expect(activity.days.find((d) => d.date === '2026-10-12')?.count).toBe(2);
    expect(activity.days.filter((d) => d.count === 0)).toHaveLength(361);
    expect(activity.totalCommits).toBe(6);
    expect(activity.activeDays).toBe(3);
  });

  it('produces twelve monthly buckets including empty months', () => {
    expect(activity.monthly).toHaveLength(12);
    expect(activity.monthly[0].month).toBe('2025-11');
    expect(activity.monthly[11]).toEqual({ month: '2026-10', commits: 6 });
    expect(activity.monthly.filter((m) => m.commits === 0)).toHaveLength(11);
  });

  it('reports all seven weekdays, Monday first', () => {
    expect(activity.weekday.map((d) => d.day)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(activity.weekday.map((d) => d.commits)).toEqual([2, 0, 0, 0, 0, 3, 1]);
  });
});

describe('analytics endpoints', () => {
  it('folds languages beyond eight into Other with percentages totalling 100', async () => {
    const langs = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Lang${i}`, (10 - i) * 1000]));
    fetchMock.mockResolvedValueOnce(json(langs));
    const res = await request(app).get(`/api/repositories/${ID}/languages`);

    expect(res.status).toBe(200);
    expect(res.body.data.languages).toHaveLength(8);
    expect(res.body.data.languages.at(-1).name).toBe('Other');
    const total = res.body.data.languages.reduce((s: number, l: { percent: number }) => s + l.percent, 0);
    expect(Math.round(total * 10) / 10).toBe(100);
    expect(calledUrls()[0]).toBe(`https://api.github.com/repositories/${ID}/languages`);
  });

  it('caches computed analytics on the repository record', async () => {
    fetchMock.mockResolvedValueOnce(json({ TypeScript: 100 }));
    await request(app).get(`/api/repositories/${ID}/languages`);
    const second = await request(app).get(`/api/repositories/${ID}/languages`);

    expect(second.body.data.languages[0]).toMatchObject({ name: 'TypeScript', percent: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const doc = await Repository.findOne({ githubId: ID }).lean();
    expect((doc!.analytics as Record<string, unknown>).languages).toBeDefined();
  });

  it('returns the top ten contributors ordered by commits, and handles empty repositories', async () => {
    const people = Array.from({ length: 10 }, (_, i) => ({ login: `dev${i}`, avatar_url: '', html_url: '', contributions: i + 1, type: 'User' }));
    fetchMock.mockResolvedValueOnce(json(people));
    const res = await request(app).get(`/api/repositories/${ID}/contributors`);
    expect(res.body.data.contributors).toHaveLength(10);
    expect(res.body.data.contributors[0]).toMatchObject({ login: 'dev9', commits: 10 });

    await Repository.updateOne({ githubId: ID }, { $set: { analytics: {} } });
    fetchMock.mockResolvedValueOnce(json(null, 204));
    const empty = await request(app).get(`/api/repositories/${ID}/contributors`);
    expect(empty.body.data.contributors).toEqual([]);
  });

  it('answers 202 while GitHub is still computing commit statistics, then serves data', async () => {
    fetchMock.mockImplementation(async () => json({}, 202));
    const pending = await request(app).get(`/api/repositories/${ID}/commits`);
    expect(pending.status).toBe(202);
    expect(pending.body).toEqual({ status: 'pending', retryAfter: 5 });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(json([]));
    const ready = await request(app).get(`/api/repositories/${ID}/commits`);
    expect(ready.status).toBe(200);
    expect(ready.body.data.monthly).toHaveLength(12);

    // Heatmap and frequency reuse the same computed activity without another GitHub call.
    expect((await request(app).get(`/api/repositories/${ID}/heatmap`)).body.data.days).toHaveLength(364);
    expect((await request(app).get(`/api/repositories/${ID}/frequency`)).body.data.weekday).toHaveLength(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('counts open pull requests separately from open issues', async () => {
    fetchMock.mockResolvedValueOnce(
      json([{}], 200, { link: `<https://api.github.com/repositories/${ID}/pulls?state=open&per_page=1&page=12>; rel="last"` }),
    );
    const res = await request(app).get(`/api/repositories/${ID}/pulls-issues`);
    // Repository metadata reports 50 open issues including PRs.
    expect(res.body.data).toEqual({ openPullRequests: 12, openIssues: 38 });
  });

  it('paginates branches and marks the default branch', async () => {
    fetchMock.mockResolvedValueOnce(
      json([{ name: 'main', protected: true }, { name: 'dev', protected: false }], 200, {
        link: `<https://api.github.com/repositories/${ID}/branches?per_page=50&page=2>; rel="next", <https://api.github.com/repositories/${ID}/branches?per_page=50&page=3>; rel="last"`,
      }),
    );
    const res = await request(app).get(`/api/repositories/${ID}/branches`).query({ page: 1 });
    expect(res.body.data).toMatchObject({ defaultBranch: 'main', page: 1, perPage: 50, totalPages: 3 });
    expect(res.body.data.branches[0]).toEqual({ name: 'main', protected: true, isDefault: true });
    expect(calledUrls()[0]).toContain('per_page=50&page=1');
  });

  it('serves the last computed copy when GitHub fails after the cache expires', async () => {
    fetchMock.mockResolvedValueOnce(json({ Go: 10 }));
    await request(app).get(`/api/repositories/${ID}/languages`);
    await Repository.updateOne({ githubId: ID }, { $set: { 'analytics.languages.computedAt': '2020-01-01T00:00:00.000Z' } });

    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const res = await request(app).get(`/api/repositories/${ID}/languages`);
    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.data.languages[0].name).toBe('Go');
  });

  it('requires the repository to have been searched first', async () => {
    const res = await request(app).get('/api/repositories/999/languages');
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
