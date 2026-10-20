import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  StatsPendingError,
  getBranches,
  getCommitTrend,
  getContributors,
  getFrequency,
  getHeatmap,
  getLanguages,
  getPullsIssues,
} from '../../services/analytics.service';
import { getAiSummary, getAiTrendInsight } from '../../services/ai.service';
import { getHealthScore } from '../../services/health.service';
import { logActivity, track } from '../../services/activity.service';
import { EXPORT_FORMATS, exportReport } from '../../services/export.service';
import { requireAuth } from '../middleware/auth';
import { recordSearch } from '../../services/personal.service';
import { getRepositoryById, resolveRepository } from '../../services/repository.service';
import { ownerSchema, repoSchema } from '../../lib/repoRef';

// Validated here before calling GitHub.
const searchSchema = z.object({ owner: ownerSchema, repo: repoSchema });
const idSchema = z.coerce.number().int().positive('Invalid repository ID.');
const pageSchema = z.coerce.number().int().min(1).max(1000).default(1);

/** Sends an analytics result, or 202 with a retry hint while GitHub is still computing statistics. */
async function sendAnalytics(res: Response, work: Promise<unknown>) {
  try {
    res.json(await work);
  } catch (err) {
    if (!(err instanceof StatsPendingError)) throw err;
    res.status(202).set('Retry-After', String(err.retryAfter)).json({ status: 'pending', retryAfter: err.retryAfter });
  }
}

const analytics = (fn: (id: number) => Promise<unknown>) => (req: Request, res: Response) => sendAnalytics(res, fn(idSchema.parse(req.params.id)));

export const repositoriesRouter = Router();

repositoriesRouter.get('/search', async (req, res) => {
  const { owner, repo } = searchSchema.parse(req.query);
  const result = await resolveRepository(owner, repo);
  track('repo.searches');
  // Registered users get a persistent search history (REQ-PERS-002); guests do not.
  if (req.user) await recordSearch(req.user._id, result.repository);
  res.json(result);
});

repositoriesRouter.get('/:id', async (req, res) => {
  res.json(await getRepositoryById(idSchema.parse(req.params.id)));
});

repositoriesRouter.get('/:id/languages', analytics(getLanguages));
repositoriesRouter.get('/:id/contributors', analytics(getContributors));
repositoriesRouter.get('/:id/commits', analytics(getCommitTrend));
repositoriesRouter.get('/:id/heatmap', analytics(getHeatmap));
repositoriesRouter.get('/:id/frequency', analytics(getFrequency));
repositoriesRouter.get('/:id/pulls-issues', analytics(getPullsIssues));
repositoriesRouter.get('/:id/health-score', analytics(getHealthScore));
repositoriesRouter.get('/:id/ai-summary', analytics(getAiSummary));
repositoriesRouter.get('/:id/ai-trend-insight', analytics(getAiTrendInsight));
// Report export is for Registered Users only (REQ-PERS-003, REQ-PERS-008).
repositoriesRouter.post('/:id/export', requireAuth, async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { format } = z.object({ format: z.enum(EXPORT_FORMATS) }).parse(req.body);
  const file = await exportReport(id, format);
  track('exports');
  await logActivity({ actor: req.user, action: 'export.created', target: { type: 'repository', id: String(id), label: file.label }, details: { format }, ip: req.ip });
  res.set({ 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename="${file.filename}"` }).send(file.body);
});

repositoriesRouter.get('/:id/branches', (req, res) =>
  sendAnalytics(res, getBranches(idSchema.parse(req.params.id), pageSchema.parse(req.query.page))),
);
