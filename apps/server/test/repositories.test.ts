import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { resetCache } from '../src/lib/cache';
import { Repository, RepositoryDailySnapshot } from '../src/models/Repository';

const app = createApp();
let mongo: MongoMemoryServer;

const REACT = {
  id: 10270250,
  name: 'react',
  full_name: 'facebook/react',
  owner: { login: 'facebook', avatar_url: 'https://avatars.example/facebook', type: 'Organization', html_url: 'https://github.com/facebook' },
  description: 'The library for web and native user interfaces.',
  html_url: 'https://github.com/facebook/react',
  homepage: 'https://react.dev',
  stargazers_count: 230000,
  forks_count: 47000,
  subscribers_count: 6600,
  open_issues_count: 900,
  language: 'JavaScript',
  license: { spdx_id: 'MIT', name: 'MIT License' },
  size: 1200000,
  topics: ['react', 'ui'],
  default_branch: 'main',
  created_at: '2013-05-24T16:15:54Z',
  updated_at: '2026-10-20T10:00:00Z',
  pushed_at: '2026-10-20T09:00:00Z',
  archived: false,
  fork: false,
  private: false,
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const fetchMock = vi.spyOn(globalThis, 'fetch');

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
  resetCache();
  await Repository.deleteMany({});
  await RepositoryDailySnapshot.deleteMany({});
});

describe('GET /api/repositories/search', () => {
  it('resolves a public repository, stores it and records a daily snapshot', async () => {
    fetchMock.mockResolvedValueOnce(json(REACT));
    const res = await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('github');
    expect(res.body.repository).toMatchObject({
      id: REACT.id,
      fullName: 'facebook/react',
      stars: 230000,
      watchers: 6600,
      license: { spdxId: 'MIT', name: 'MIT License' },
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.github.com/repos/facebook/react');
    expect(await Repository.countDocuments({ githubId: REACT.id })).toBe(1);
    expect(await RepositoryDailySnapshot.findOne({ githubId: REACT.id })).toMatchObject({ stars: 230000, forks: 47000 });
  });

  it('serves repeated searches from the cache without calling GitHub again', async () => {
    fetchMock.mockResolvedValueOnce(json(REACT));
    await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });
    const second = await request(app).get('/api/repositories/search').query({ owner: 'Facebook', repo: 'React' });

    expect(second.status).toBe(200);
    expect(second.body.source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed input before calling GitHub', async () => {
    for (const query of [{ owner: '-bad', repo: 'x' }, { owner: 'ok', repo: '..' }, { owner: 'ok' }, { owner: 'a b', repo: 'c' }]) {
      const res = await request(app).get('/api/repositories/search').query(query);
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('explains when a repository cannot be found', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Not Found' }, 404));
    const res = await request(app).get('/api/repositories/search').query({ owner: 'someone', repo: 'missing' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPO_NOT_FOUND');
    expect(res.body.error.message).toMatch(/private, renamed or deleted/);
  });

  it('reports GitHub rate limiting with the reset time', async () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    fetchMock.mockResolvedValueOnce(
      json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
    );
    const res = await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.resetAt).toBe(new Date(reset * 1000).toISOString());
  });

  it('falls back to the stored copy when GitHub is unavailable', async () => {
    fetchMock.mockResolvedValueOnce(json(REACT));
    await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });
    resetCache();

    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const res = await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('stale');
    expect(res.body.repository.fullName).toBe('facebook/react');
  });

  it('returns 502 when GitHub is unreachable and nothing is stored', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const res = await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('GITHUB_UNAVAILABLE');
  });
});

describe('GET /api/repositories/:id', () => {
  it('returns stored metadata by GitHub ID', async () => {
    fetchMock.mockResolvedValueOnce(json(REACT));
    await request(app).get('/api/repositories/search').query({ owner: 'facebook', repo: 'react' });

    const res = await request(app).get(`/api/repositories/${REACT.id}`);
    expect(res.status).toBe(200);
    expect(res.body.repository.name).toBe('react');
    expect((await request(app).get('/api/repositories/999')).status).toBe(404);
    expect((await request(app).get('/api/repositories/abc')).status).toBe(400);
  });
});
