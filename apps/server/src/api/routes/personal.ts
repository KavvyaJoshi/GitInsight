import { Router } from 'express';
import { z } from 'zod';
import { fullNameSchema } from '../../lib/repoRef';
import {
  clearNotifications,
  createRule,
  deleteRule,
  listNotifications,
  listRules,
  markRead,
  unreadCount,
  updateRule,
} from '../../services/alerts.service';
import { compareRepositories, getComparisonNarrative } from '../../services/comparison.service';
import {
  addBookmark,
  bookmarksForRepository,
  clearHistory,
  createCollection,
  deleteCollection,
  deleteComparisonSet,
  deleteHistoryEntry,
  listCollections,
  listComparisonSets,
  listHistory,
  removeBookmark,
  renameCollection,
  saveComparisonSet,
} from '../../services/personal.service';
import { toPublicUser } from '../../models/User';
import { requireAuth } from '../middleware/auth';

const name = z.string().trim().min(1, 'Give it a name.').max(60, 'Names can be at most 60 characters.');
const githubId = z.coerce.number().int().positive();
const compareSchema = z.object({
  repos: z.array(fullNameSchema).min(2, 'Choose at least two repositories to compare.').max(4, 'You can compare up to four repositories at a time.'),
});
const idsSchema = z.object({
  githubIds: z
    .array(githubId)
    .min(2, 'Choose at least two repositories to compare.')
    .max(4, 'You can compare up to four repositories at a time.')
    .refine((ids) => new Set(ids).size === ids.length, 'Each repository can only appear once.'),
});
const bookmarkSchema = z
  .object({ githubId, collectionId: z.string().optional(), newCollectionName: name.optional() })
  .refine((b) => b.collectionId || b.newCollectionName, 'Choose a collection or name a new one.');
const preferencesSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    defaultView: z.enum(['chart', 'table']),
    digest: z.enum(['off', 'daily', 'weekly']),
  })
  .partial();

/** Bookmarks, collections, history, comparison and preferences: Registered Users only (REQ-PERS-008, BR-002). */
export const personalRouter = Router();
personalRouter.use(['/collections', '/bookmarks', '/history', '/preferences', '/comparisons', '/comparison-sets', '/alerts', '/notifications'], requireAuth);

// ---- Alerts (REQ-PERS-004) and notifications (REQ-PERS-006) ----

const alertSchema = z.discriminatedUnion('type', [
  z.object({ githubId, type: z.literal('star_threshold'), threshold: z.coerce.number().int().min(1, 'Choose at least 1 star.').max(10_000_000) }),
  z.object({ githubId, type: z.literal('new_release') }),
]);

personalRouter.get('/alerts', async (req, res) => {
  res.json({ alerts: await listRules(req.user!._id) });
});
personalRouter.post('/alerts', async (req, res) => {
  res.status(201).json({ alert: await createRule(req.user!._id, alertSchema.parse(req.body)) });
});
personalRouter.patch('/alerts/:id', async (req, res) => {
  const changes = z.object({ active: z.boolean().optional(), threshold: z.coerce.number().int().min(1).max(10_000_000).optional() }).parse(req.body);
  res.json({ alert: await updateRule(req.user!._id, req.params.id, changes) });
});
personalRouter.delete('/alerts/:id', async (req, res) => {
  await deleteRule(req.user!._id, req.params.id);
  res.status(204).end();
});

personalRouter.get('/notifications', async (req, res) => {
  res.json(await listNotifications(req.user!._id));
});
personalRouter.get('/notifications/unread-count', async (req, res) => {
  res.json({ unread: await unreadCount(req.user!._id) });
});
personalRouter.post('/notifications/read', async (req, res) => {
  await markRead(req.user!._id, z.object({ id: z.string().optional() }).parse(req.body ?? {}).id);
  res.status(204).end();
});
personalRouter.delete('/notifications', async (req, res) => {
  await clearNotifications(req.user!._id);
  res.status(204).end();
});

personalRouter.get('/collections', async (req, res) => {
  res.json({ collections: await listCollections(req.user!._id) });
});
personalRouter.post('/collections', async (req, res) => {
  res.status(201).json({ collection: await createCollection(req.user!._id, name.parse(req.body?.name)) });
});
personalRouter.patch('/collections/:id', async (req, res) => {
  res.json({ collection: await renameCollection(req.user!._id, req.params.id, name.parse(req.body?.name)) });
});
personalRouter.delete('/collections/:id', async (req, res) => {
  await deleteCollection(req.user!._id, req.params.id);
  res.status(204).end();
});

personalRouter.get('/bookmarks', async (req, res) => {
  res.json({ bookmarks: await bookmarksForRepository(req.user!._id, githubId.parse(req.query.githubId)) });
});
personalRouter.post('/bookmarks', async (req, res) => {
  res.status(201).json({ bookmark: await addBookmark(req.user!._id, bookmarkSchema.parse(req.body)) });
});
personalRouter.delete('/bookmarks/:id', async (req, res) => {
  await removeBookmark(req.user!._id, req.params.id);
  res.status(204).end();
});

personalRouter.get('/history', async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
  const before = req.query.before ? z.coerce.date().parse(req.query.before) : undefined;
  res.json(await listHistory(req.user!._id, limit, before));
});
personalRouter.delete('/history', async (req, res) => {
  await clearHistory(req.user!._id);
  res.status(204).end();
});
personalRouter.delete('/history/:id', async (req, res) => {
  await deleteHistoryEntry(req.user!._id, req.params.id);
  res.status(204).end();
});

personalRouter.put('/preferences', async (req, res) => {
  const updates = preferencesSchema.parse(req.body);
  const user = req.user!;
  user.set('preferences', { ...user.toObject().preferences, ...updates });
  await user.save();
  res.json({ user: toPublicUser(user) });
});

personalRouter.post('/comparisons', async (req, res) => {
  res.json(await compareRepositories(compareSchema.parse(req.body).repos));
});
personalRouter.post('/comparisons/narrative', async (req, res) => {
  res.json(await getComparisonNarrative(idsSchema.parse(req.body).githubIds));
});

personalRouter.get('/comparison-sets', async (req, res) => {
  res.json({ sets: await listComparisonSets(req.user!._id) });
});
personalRouter.post('/comparison-sets', async (req, res) => {
  const body = z.object({ name }).and(idsSchema).parse(req.body);
  res.status(201).json({ set: await saveComparisonSet(req.user!._id, body.name, body.githubIds) });
});
personalRouter.delete('/comparison-sets/:id', async (req, res) => {
  await deleteComparisonSet(req.user!._id, req.params.id);
  res.status(204).end();
});
