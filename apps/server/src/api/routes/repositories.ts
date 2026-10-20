import { Router } from 'express';
import { z } from 'zod';
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

export const repositoriesRouter = Router();

repositoriesRouter.get('/search', async (req, res) => {
  const { owner, repo } = searchSchema.parse(req.query);
  res.json(await resolveRepository(owner, repo));
});

repositoriesRouter.get('/:id', async (req, res) => {
  const id = z.coerce.number().int().positive('Invalid repository ID.').parse(req.params.id);
  res.json(await getRepositoryById(id));
});
