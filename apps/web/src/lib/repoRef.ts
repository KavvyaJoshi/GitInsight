export interface RepoRef {
  owner: string;
  repo: string;
}

// GitHub rules: owners are 1–39 alphanumerics with single inner hyphens; repos are 1–100 of [A-Za-z0-9._-].
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;

/** Accepts "owner/repo" or a github.com URL and validates it before any request is made. */
export function parseRepoRef(input: string): { ok: true; value: RepoRef } | { ok: false; error: string } {
  const cleaned = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  if (!cleaned) return { ok: false, error: 'Enter a repository, for example facebook/react.' };
  const [owner, repo] = cleaned.split('/');
  if (!repo) return { ok: false, error: 'Use the format owner/repository, for example facebook/react.' };
  if (!OWNER.test(owner)) return { ok: false, error: `“${owner}” is not a valid GitHub owner name.` };
  if (!REPO.test(repo) || repo === '.' || repo === '..') {
    return { ok: false, error: `“${repo}” is not a valid GitHub repository name.` };
  }
  return { ok: true, value: { owner, repo } };
}
