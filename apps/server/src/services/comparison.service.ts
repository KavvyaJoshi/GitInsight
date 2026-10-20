import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { getLlmProvider } from '../integrations/llm';
import { Repository, type RepositoryMetadata } from '../models/Repository';
import { SHARED_RULES, generateOnce } from './ai.service';
import { StatsPendingError, getLanguages } from './analytics.service';
import { getHealthScore } from './health.service';
import { resolveRepository } from './repository.service';

type Health = Awaited<ReturnType<typeof getHealthScore>>['data'];

async function healthOf(githubId: number): Promise<{ health: Health | null; healthPending: boolean }> {
  try {
    return { health: (await getHealthScore(githubId)).data, healthPending: false };
  } catch (err) {
    if (err instanceof StatsPendingError) return { health: null, healthPending: true };
    return { health: null, healthPending: false };
  }
}

/** Side-by-side metadata, health and languages for two to four repositories (REQ-COMP-001/002). */
export async function compareRepositories(refs: { owner: string; repo: string }[]) {
  const resolved = await Promise.all(refs.map((r) => resolveRepository(r.owner, r.repo)));
  const unique = resolved.filter((r, i) => resolved.findIndex((o) => o.repository.id === r.repository.id) === i);
  if (unique.length < 2) throw new HttpError(400, 'VALIDATION_ERROR', 'Choose two to four different repositories to compare.');

  const repos = await Promise.all(
    unique.map(async ({ repository }) => {
      const [{ health, healthPending }, languages] = await Promise.all([
        healthOf(repository.id),
        getLanguages(repository.id).then((r) => r.data.languages).catch(() => null),
      ]);
      return { repository, health, healthPending, languages };
    }),
  );
  return { repos };
}

const narrativeSchema = z.object({
  narrative: z.string().describe('Three or four sentences on the most important differences between the repositories, citing the figures given.'),
  bestFor: z
    .array(z.object({ repository: z.string().describe('owner/name exactly as given'), useCase: z.string().describe('Under 12 words: who or what this repository suits best.') }))
    .describe('One entry per repository.'),
});

/** AI-written comparison of the key differences (REQ-COMP-003). */
export async function getComparisonNarrative(githubIds: number[]) {
  const provider = getLlmProvider();
  const now = new Date().toISOString();
  if (!provider) {
    return {
      status: 'ready' as const,
      data: { available: false as const, reason: 'NOT_CONFIGURED' as const, message: 'AI insights are not configured on this server. The comparison above is unaffected.' },
      computedAt: now,
      stale: false,
    };
  }

  const docs = await Repository.find({ githubId: { $in: githubIds } }).select('githubId metadata').lean();
  if (docs.length !== githubIds.length) throw new HttpError(404, 'REPO_NOT_FOUND', 'Compare these repositories before asking for a narrative.');

  const facts = await Promise.all(
    githubIds.map(async (id) => {
      const meta = docs.find((d) => d.githubId === id)!.metadata as RepositoryMetadata;
      const { health } = await healthOf(id);
      return {
        repository: meta.fullName,
        description: meta.description,
        primaryLanguage: meta.language,
        stars: meta.stars,
        forks: meta.forks,
        openIssuesIncludingPRs: meta.openIssues,
        license: meta.license?.spdxId ?? null,
        createdAt: meta.createdAt.slice(0, 10),
        lastPush: meta.pushedAt?.slice(0, 10) ?? null,
        archived: meta.archived,
        healthScore: health?.score ?? null,
        healthSignals: Object.fromEntries((health?.components ?? []).map((c) => [c.key, c.score])),
      };
    }),
  );

  const result = await generateOnce(Math.min(...githubIds), 'comparison', facts, () =>
    provider.generate({
      schema: narrativeSchema,
      system: `You compare GitHub repositories for an analytics dashboard, helping a developer choose between them.\n${SHARED_RULES}`,
      prompt: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}\n\nCompare these repositories.`,
    }),
  );

  return {
    status: 'ready' as const,
    data: {
      available: true as const,
      ...result.content,
      model: result.model,
      generatedAt: result.generatedAt,
      sources: ['repository metadata', 'health scores'],
    },
    computedAt: now,
    stale: false,
  };
}
