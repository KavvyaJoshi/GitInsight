import { z } from 'zod';

// GitHub naming rules, mirrored in the web client (apps/web/src/lib/repoRef.ts).
export const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const REPO = /^[A-Za-z0-9._-]{1,100}$/;

export const ownerSchema = z.string().trim().regex(OWNER, 'Enter a valid GitHub owner name.');
export const repoSchema = z
  .string()
  .trim()
  .regex(REPO, 'Enter a valid GitHub repository name.')
  .refine((r) => r !== '.' && r !== '..', 'Enter a valid GitHub repository name.');

/** "owner/repo" → { owner, repo }, validated. */
export const fullNameSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const [owner = '', repo = '', ...rest] = value.split('/');
    const parsed = z.object({ owner: ownerSchema, repo: repoSchema }).safeParse({ owner, repo });
    if (rest.length || !parsed.success) {
      ctx.addIssue({ code: 'custom', message: `“${value}” is not a valid owner/repository name.` });
      return z.NEVER;
    }
    return parsed.data;
  });
