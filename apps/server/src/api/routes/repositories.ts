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
import { getRepositoryById, resolveRepository } from '../../services/repository.service';

// Same GitHub naming rules as the web client (apps/web/src/lib/repoRef.ts); validated here before calling GitHub.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

const searchSchema = z.object({
  owner: z.string().trim().regex(OWNER, 'Enter a valid GitHub owner name.'),
  repo: z
    .string()
    .trim()
    .regex(REPO, 'Enter a valid GitHub repository name.')
    .refine((r) => r !== '.' && r !== '..', 'Enter a valid GitHub repository name.'),
});
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
  res.json(await resolveRepository(owner, repo));
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
repositoriesRouter.get('/:id/branches', (req, res) =>
  sendAnalytics(res, getBranches(idSchema.parse(req.params.id), pageSchema.parse(req.query.page))),
);
