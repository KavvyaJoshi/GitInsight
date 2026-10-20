import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { resetCache } from '../src/lib/cache';
import { Bookmark, Collection, ComparisonSet, SearchHistory } from '../src/models/Personal';
import { Repository } from '../src/models/Repository';
import { Session } from '../src/models/Session';
import { User } from '../src/models/User';

const app = createApp();
let mongo: MongoMemoryServer;
const fetchMock = vi.spyOn(globalThis, 'fetch');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Minimal fake GitHub: any owner/repo exists; every analytics endpoint returns empty data. */
function fakeGitHub() {
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    const repo = url.match(/\/repos\/([^/]+)\/([^/?]+)$/);
    if (repo) {
      const [owner, name] = [repo[1], repo[2]];
      const id = [...`${owner}/${name}`.toLowerCase()].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % 1_000_000;
      return json({
        id,
        name,
        full_name: `${owner}/${name}`,
        owner: { login: owner, avatar_url: '', type: 'User', html_url: '' },
        description: `${name} project`,
        html_url: '',
        homepage: null,
        stargazers_count: 10,
        forks_count: 2,
        subscribers_count: 1,
        open_issues_count: 0,
        language: 'TypeScript',
        license: null,
        size: 1,
        topics: [],
        default_branch: 'main',
        created_at: '2020-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        pushed_at: '2026-01-01T00:00:00Z',
        archived: false,
        fork: false,
        private: false,
      });
    }
    if (url.includes('/languages')) return json({ TypeScript: 100 });
    return json([]);
  });
}

async function signUp(email: string) {
  const res = await request(app).post('/api/auth/register').send({ email, password: 'Secret123' });
  return `Bearer ${res.body.accessToken}`;
}

async function searchAs(auth: string, owner: string, repo: string) {
  return request(app).get('/api/repositories/search').query({ owner, repo }).set('Authorization', auth);
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Duplicate prevention relies on unique indexes; make sure they exist before the first test.
  await Promise.all([Collection.init(), Bookmark.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  fetchMock.mockReset();
  fakeGitHub();
  resetCache();
  await Promise.all([User, Session, Repository, Collection, Bookmark, SearchHistory, ComparisonSet].map((m) => (m as typeof User).deleteMany({})));
});

describe('access control', () => {
  it('restricts personal features to registered users', async () => {
    for (const path of ['/api/collections', '/api/history', '/api/comparison-sets']) {
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect((await request(app).post('/api/comparisons').send({ repos: ['a/b', 'c/d'] })).status).toBe(401);
    expect((await request(app).get('/api/unknown')).status).toBe(404);
  });
});

describe('collections and bookmarks', () => {
  it('bookmarks into named collections and prevents duplicates', async () => {
    const auth = await signUp('a@example.com');
    const { body } = await searchAs(auth, 'acme', 'widget');
    const githubId = body.repository.id;

    const created = await request(app).post('/api/bookmarks').set('Authorization', auth).send({ githubId, newCollectionName: 'Favourites' });
    expect(created.status).toBe(201);

    const dup = await request(app).post('/api/bookmarks').set('Authorization', auth).send({ githubId, collectionId: created.body.bookmark.collectionId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('ALREADY_BOOKMARKED');

    expect((await request(app).post('/api/collections').set('Authorization', auth).send({ name: 'favourites' })).status).toBe(409);

    const list = await request(app).get('/api/collections').set('Authorization', auth);
    expect(list.body.collections).toHaveLength(1);
    expect(list.body.collections[0].bookmarks[0]).toMatchObject({ fullName: 'acme/widget', language: 'TypeScript' });

    const status = await request(app).get('/api/bookmarks').query({ githubId }).set('Authorization', auth);
    expect(status.body.bookmarks).toHaveLength(1);
  });

  it('keeps each user’s data private', async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const { body } = await searchAs(alice, 'acme', 'widget');
    const created = await request(app).post('/api/bookmarks').set('Authorization', alice).send({ githubId: body.repository.id, newCollectionName: 'Mine' });

    expect((await request(app).get('/api/collections').set('Authorization', bob)).body.collections).toEqual([]);
    expect((await request(app).delete(`/api/bookmarks/${created.body.bookmark.id}`).set('Authorization', bob)).status).toBe(404);
    expect((await request(app).delete(`/api/collections/${created.body.bookmark.collectionId}`).set('Authorization', bob)).status).toBe(404);
    expect((await request(app).post('/api/bookmarks').set('Authorization', bob).send({ githubId: body.repository.id, collectionId: created.body.bookmark.collectionId })).status).toBe(404);
  });

  it('deleting a collection removes its bookmarks', async () => {
    const auth = await signUp('a@example.com');
    const { body } = await searchAs(auth, 'acme', 'widget');
    const created = await request(app).post('/api/bookmarks').set('Authorization', auth).send({ githubId: body.repository.id, newCollectionName: 'Temp' });
    expect((await request(app).delete(`/api/collections/${created.body.bookmark.collectionId}`).set('Authorization', auth)).status).toBe(204);
    expect(await Bookmark.countDocuments()).toBe(0);
  });
});

describe('search history', () => {
  it('records registered users’ searches newest first, but not guests’', async () => {
    const auth = await signUp('a@example.com');
    await searchAs(auth, 'acme', 'one');
    await searchAs(auth, 'acme', 'two');
    await request(app).get('/api/repositories/search').query({ owner: 'acme', repo: 'guest' });

    const res = await request(app).get('/api/history').set('Authorization', auth);
    expect(res.body.entries.map((e: { fullName: string }) => e.fullName)).toEqual(['acme/two', 'acme/one']);
    expect(await SearchHistory.countDocuments()).toBe(2);
  });

  it('collapses an immediate repeat of the same search', async () => {
    const auth = await signUp('a@example.com');
    await searchAs(auth, 'acme', 'one');
    await searchAs(auth, 'acme', 'one');
    expect(await SearchHistory.countDocuments()).toBe(1);
  });

  it('keeps only the 500 most recent entries', async () => {
    const auth = await signUp('a@example.com');
    const user = await User.findOne({ email: 'a@example.com' });
    const old = Date.now() - 1_000_000;
    await SearchHistory.insertMany(Array.from({ length: 505 }, (_, i) => ({ userId: user!._id, githubId: i, fullName: `old/r${i}`, searchedAt: new Date(old + i) })));
    await searchAs(auth, 'acme', 'latest');

    expect(await SearchHistory.countDocuments({ userId: user!._id })).toBe(500);
    const newest = await request(app).get('/api/history').query({ limit: 1 }).set('Authorization', auth);
    expect(newest.body.entries[0].fullName).toBe('acme/latest');
    expect(await SearchHistory.exists({ fullName: 'old/r0' })).toBeNull();
  });

  it('clears history', async () => {
    const auth = await signUp('a@example.com');
    await searchAs(auth, 'acme', 'one');
    expect((await request(app).delete('/api/history').set('Authorization', auth)).status).toBe(204);
    expect(await SearchHistory.countDocuments()).toBe(0);
  });
});

describe('comparison', () => {
  it('accepts two to four repositories only', async () => {
    const auth = await signUp('a@example.com');
    const one = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['acme/a'] });
    expect(one.status).toBe(400);
    expect(one.body.error.message).toMatch(/at least two/);
    const five = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['a/a', 'a/b', 'a/c', 'a/d', 'a/e'] });
    expect(five.status).toBe(400);
    expect(five.body.error.message).toMatch(/up to four/);
    const same = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['acme/a', 'ACME/A'] });
    expect(same.status).toBe(400);
  });

  it('returns metadata, health and languages side by side', async () => {
    const auth = await signUp('a@example.com');
    const res = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['acme/a', 'acme/b'] });
    expect(res.status).toBe(200);
    expect(res.body.repos).toHaveLength(2);
    expect(res.body.repos[0].repository.fullName).toBe('acme/a');
    expect(res.body.repos[0].languages[0]).toMatchObject({ name: 'TypeScript', percent: 100 });
    expect(res.body.repos[0].health).toHaveProperty('components');
  });

  it('saves a named comparison set and lists it again later', async () => {
    const auth = await signUp('a@example.com');
    const cmp = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['acme/a', 'acme/b'] });
    const ids = cmp.body.repos.map((r: { repository: { id: number } }) => r.repository.id);

    const saved = await request(app).post('/api/comparison-sets').set('Authorization', auth).send({ name: 'Frameworks', githubIds: ids });
    expect(saved.status).toBe(201);
    const sets = await request(app).get('/api/comparison-sets').set('Authorization', auth);
    expect(sets.body.sets[0]).toMatchObject({ name: 'Frameworks', repos: ['acme/a', 'acme/b'] });
  });

  it('reports that AI narratives need configuration when no provider is set', async () => {
    const auth = await signUp('a@example.com');
    const cmp = await request(app).post('/api/comparisons').set('Authorization', auth).send({ repos: ['acme/a', 'acme/b'] });
    const ids = cmp.body.repos.map((r: { repository: { id: number } }) => r.repository.id);
    const res = await request(app).post('/api/comparisons/narrative').set('Authorization', auth).send({ githubIds: ids });
    expect(res.body.data).toMatchObject({ available: false, reason: 'NOT_CONFIGURED' });
  });
});

describe('preferences', () => {
  it('persists theme, default chart view and digest frequency on the account', async () => {
    const auth = await signUp('a@example.com');
    const res = await request(app).put('/api/preferences').set('Authorization', auth).send({ theme: 'dark', digest: 'weekly' });
    expect(res.body.user.preferences).toEqual({ theme: 'dark', defaultView: 'chart', digest: 'weekly' });

    const me = await request(app).get('/api/auth/me').set('Authorization', auth);
    expect(me.body.user.preferences.theme).toBe('dark');
    expect((await request(app).put('/api/preferences').set('Authorization', auth).send({ theme: 'neon' })).status).toBe(400);
  });
});
