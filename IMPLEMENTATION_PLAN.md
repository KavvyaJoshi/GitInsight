# GitInsight implementation plan

Based on GitInsight SRS version 1.0, August 2026.

## 1. Goal and planning assumptions

Build a read-only analytics platform for public GitHub repositories, with interactive charts, AI explanations, a transparent health score, and registered-user tracking tools.

The workspace was empty when this plan was prepared. This is a proposed implementation plan, not a record of completed work.

Planning assumption: three student developers working part-time over twelve weeks. Adjust the schedule to actual availability after the first two weeks. The intermediate MVP is a milestone; the remaining SRS features are still required for the complete version.

Keep private repositories, GitLab/Bitbucket, team workspaces, natural-language querying, browser extensions, and native mobile apps outside version 1.

## 2. Architecture

```text
React browser application
          |
          | HTTPS / REST
          v
Express API ---- MongoDB: users, repositories, snapshots, saved data
     |
     +--------- Redis: cache, rate tracking, job queue
                       |
                       v
                 Background worker
                       |
                       +--- GitHub REST / GraphQL
                       +--- Configurable LLM provider
```

The API resolves searches and serves cached results. Workers perform expensive analytics, AI generation, scheduled refreshes, alerts, and exports. Only server processes hold external credentials. The browser polls job status initially; a streaming transport is unnecessary for the first version.

Use the SRS stack:

| Area | Implementation |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Backend | Express and TypeScript on a supported Node.js LTS version satisfying the SRS minimum |
| Persistence | MongoDB with Mongoose |
| Cache and jobs | Redis; proposed queue library: BullMQ |
| Charts | Recharts for standard charts; a dedicated calendar heatmap |
| Authentication | bcrypt, JWT access tokens, rotating refresh tokens, Google OAuth |
| Integrations | GitHub REST/GraphQL clients and a provider-independent LLM adapter |
| Validation | Shared request/response schemas |
| Delivery | Static frontend, separate API and worker containers, MongoDB and Redis |

Lock dependency versions during setup. Keep the API and worker in one codebase with separate entry points, avoiding unnecessary microservices.

Proposed repository layout:

```text
apps/
  web/src/           # routes, components, charts, API hooks
  server/src/
    api/             # routes, middleware, controllers
    services/        # analytics, health, AI, accounts, personalization
    integrations/    # GitHub and LLM adapters
    models/
    jobs/
    worker.ts
packages/
  contracts/         # shared schemas and types
tests/
  fixtures/
  integration/
  e2e/
docs/
  architecture.md
  api.yaml
  requirements-matrix.md
infra/
  compose.yaml
```

## 3. Settle measurement rules in week 1

These are proposed defaults, not facts established by the SRS.

1. **Commit scope:** use the default branch, UTC dates, and one consistent rolling twelve-month window for daily, monthly, and weekday aggregations. Include zero-value dates and buckets. Document merge-commit treatment.
2. **Contributor diversity:** measure the distribution of contributions across contributors, not demographic characteristics. Document bot inclusion and the data window.
3. **Maintenance:** measure first-response times for issues and pull requests using a documented recent window. Distinguish no response, no qualifying records, and missing data.
4. **Popularity:** collect daily star/fork snapshots from the first import. Do not substitute current totals for growth. Until a baseline exists, mark the growth sub-score unavailable.
5. **Health formula:** start with equal weights across four normalized 0–100 sub-scores. Renormalize over available sub-scores only when at least two exist; otherwise show “Not available.” Publish thresholds, coverage, formula version, and limitations. Calibrate against small and large repositories before freezing the formula.
6. **Freshness:** initial configurable targets: metadata 15 minutes, computed analytics one hour, alert checks hourly, growth snapshots daily. Use stale results with a visible timestamp while refreshing.
7. **Account defaults:** propose a 15-minute lockout after five consecutive failed attempts, 15-minute access tokens, and 7-day rotating refresh sessions.
8. **Email digest ambiguity:** the SRS requires saving digest frequency but does not clearly require sending email. Include the preference in version 1; confirm delivery scope before adding an email provider.
9. **Timing targets:** measure cached requests and first-time imports separately. Preserve the stated SRS targets and report any shortfall; do not silently redefine cold imports as cached requests.

## 4. Delivery milestones

| Phase | Timing | Work | Completion evidence |
|---|---|---|---|
| Foundation | Week 1 | Finalize metric rules, wireframes, API contracts, repository structure, local MongoDB/Redis, CI, environment examples | Web/API/worker start locally; health checks and CI pass |
| Search and overview | Week 2 | Owner/repo validation, GitHub integration, metadata cache, responsive dashboard shell, independent error states | Public repo opens; missing/private/rate-limited responses are clear; repeated search uses cache |
| Analytics MVP | Weeks 3–4 | Languages, top ten contributors, monthly commits, separate PR/issue counts, daily heatmap, weekday frequency, paginated branches | All seven analytics views use real data; empty and partial data work; duplicate jobs are prevented |
| Accounts | Week 5 | Email/password, Google OAuth, refresh rotation, logout, lockout, user/admin roles | Guest access remains available; authenticated and role-restricted routes pass integration tests |
| Health and AI | Weeks 6–7 | Four health components, daily snapshots, versioned formula, summary, trend insight, caching and provider adapter | Score explains missing inputs; AI failures preserve dashboard; insufficient history skips trend generation |
| Personalization and comparison | Weeks 8–9 | Collections, bookmarks, 500-entry history, preferences, saved 2–4 repo comparisons and AI comparison | Saved data persists across sessions; user ownership and duplicate prevention are enforced |
| Alerts, exports, administration | Week 10 | Star/release alerts, notifications, PDF/CSV/JSON exports, usage panel, account deactivation and audit logs | Retried jobs do not duplicate notifications; exports work; deactivated accounts lose access |
| Hardening | Week 11 | Accessibility basics, mobile layout, failure recovery, security checks, load and performance tests | Measured results against SRS targets; documented fixes or remaining gaps |
| Release and evaluation | Week 12 | Deployment, full regression, API docs, architecture diagrams, report, demo rehearsal | Reproducible setup and deployed demo; requirement-to-test matrix completed |

The first useful demo is the guest analytics dashboard at the end of week 4. Do not make login or AI availability a dependency of that demo.

Suggested team ownership: one frontend lead, one API/authentication lead, and one analytics/worker/integration lead. All three review contracts, contribute tests, and integrate weekly.

## 5. Data model

| Collection | Main responsibility |
|---|---|
| Users | Email, password hash or Google identity, role, status, preferences, failed-login state |
| Sessions | Hashed refresh-token state, expiry, rotation family and revocation |
| Repositories | Stable GitHub ID, current owner/name, metadata and freshness |
| AnalyticsSnapshots | Repository/version/window, computed datasets, source coverage and health score |
| RepositoryDailySnapshots | Date, stars and forks for observed growth |
| AIInsights | Repository IDs, input hash, insight type, prompt/model version, result and status |
| Collections / Bookmarks | User-owned named collections and repository membership |
| SearchHistory | User, repository and timestamp; enforce newest 500 entries |
| ComparisonSets | User, name and 2–4 distinct repository IDs |
| AlertRules / Notifications | Rule configuration, last evaluated state, deduplication key and read state |
| UsageEvents / AuditLogs | API usage, failures and administrator actions with sensitive fields excluded |

Add unique indexes for provider identities, repository GitHub IDs, collection/repository bookmark pairs, and repository/date snapshots. Index history and notifications by user/time. Specify retention for logs and snapshots. Avoid storing all raw commits in one MongoDB document; aggregate or store paginated records separately.

## 6. API and asynchronous data flow

Retain the SRS endpoint families and complete their lifecycle operations:

- Authentication: register, login, Google sign-in, refresh, logout and current user.
- Repositories: search, metadata, individual analytics, health and AI insight endpoints.
- Jobs: authorized status checks and controlled retries for pending computations.
- User data: create/read/update/delete collections, bookmarks, comparison sets and alert rules; history and preferences.
- Notifications: list, unread count, mark read and clear.
- Exports: request generation, inspect status and download an authorized artifact.
- Administration: usage, users, account deactivation and audit logs.

For a repository request:

1. Validate input and resolve the public repository.
2. Return cached metadata immediately when available.
3. Deduplicate analytics work by repository, input version and calculation type.
4. Return ready data or explicit pending status; give the browser a retry interval.
5. Persist completed results, timestamps and coverage.
6. Generate AI insights only after their required inputs are ready.
7. Retry failures per component without discarding successful tabs.

Use a consistent response contract with `status`, `data`, `updatedAt`, `dataVersion`, `coverage`, and structured errors. Distinguish empty datasets from unavailable datasets.

## 7. Integration risks and safeguards

**GitHub pagination and limits:** retrieve all pages required for each metric; use bounded worker concurrency, backoff, rate-limit headers, and shared caching. If a large import cannot finish within its resource budget, expose incomplete coverage rather than presenting partial totals as complete.

**Statistics readiness:** GitHub statistics endpoints can return HTTP 202 while computing data. The worker must retry with backoff rather than interpret this as an empty repository. See [GitHub repository statistics](https://docs.github.com/en/rest/metrics/statistics).

**Issue counts:** GitHub issue responses can include pull requests. Filter or use appropriately separated queries so the two chart series do not double-count. See [GitHub issues API](https://docs.github.com/en/rest/issues/issues).

**External request budgets:** 500 concurrent dashboard users must not create 500 independent imports of the same repository. Test cache reuse and job deduplication. Monitor upstream limits separately from application throughput. See [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

**AI reliability:** provide structured facts and bounded README text; treat repository text as untrusted input, never as instructions. Do not give the summarizer tools or secrets. Validate output, label it AI-generated, impose time/token limits, cache by input hash, and fall back cleanly.

**Session protection:** use secure HttpOnly refresh cookies, short-lived access tokens, refresh rotation/reuse detection, CSRF protections appropriate to cookie-based endpoints, input validation and server-side authorization. Account deactivation must affect existing sessions.

**Alerts:** establish a baseline at rule creation. Notify once per new release or threshold transition, including when workers retry.

## 8. Verification and release criteria

Maintain `docs/requirements-matrix.md` with one row per SRS requirement: requirement ID, implementation area, test evidence and status. Include scenario-only rules such as the fewer-than-two-health-components fallback.

Test at three levels:

- **Unit:** zero-filled time buckets, leap days/window boundaries, percentages, contributor order, PR/issue separation, health normalization and missing data, alert transitions and AI cache keys.
- **Integration:** GitHub pagination/202/403/429/timeouts, cache and queue behavior, refresh rotation, lockouts, cross-user access, deactivation, duplicate bookmarks and notifications, and all export formats.
- **End-to-end:** guest search to dashboard; registration/login; bookmark/history; saved comparison; alert notification; export download; admin restrictions; independent failed-tab retry.

Use deterministic fixtures for empty, new, archived, large and partially unavailable repositories. Use a small live smoke suite to validate external integrations; keep routine tests independent of network quotas.

Measure the SRS targets: search/landing within 3 seconds, charts within 2 seconds after data retrieval, AI and exports within 10 seconds, and standard API requests at p95 <= 2 seconds with 500 concurrent users. Record hardware, dataset sizes, request mix, cache state and upstream behavior. Also test at 320px width, both themes and the required browser versions.

Release deliverables: application source, environment examples, Docker configuration, deployed demo, README, API reference, architecture/data-flow diagrams, test report, requirements matrix, and documented limitations.

## 9. First implementation sprint

1. Approve metric definitions within the team and write the initial requirements matrix.
2. Scaffold web, API and worker applications with shared TypeScript contracts.
3. Add local MongoDB/Redis and a small fixture set.
4. Implement repository search, metadata caching and overview.
5. Add languages as the first complete chart.
6. Demonstrate invalid input, unavailable repository, cached load and independent retry.

This establishes the complete browser-to-backend-to-GitHub path before expanding into more costly analytics and AI.
