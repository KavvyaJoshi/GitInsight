import PDFDocument from 'pdfkit';
import { HttpError } from '../lib/errors';
import { Repository, type RepositoryMetadata } from '../models/Repository';
import { getActivity, getContributors, getLanguages, getPullsIssues } from './analytics.service';
import { getHealthScore } from './health.service';

export const EXPORT_FORMATS = ['pdf', 'csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

const settle = <T>(p: Promise<{ data: T }>): Promise<T | null> => p.then((r) => r.data).catch(() => null);

/** Everything the dashboard shows, gathered from the analytics caches. */
export async function buildReport(githubId: number) {
  const doc = await Repository.findOne({ githubId }).select('metadata').lean();
  if (!doc) throw new HttpError(404, 'REPO_NOT_FOUND', 'Search for this repository before exporting it.');
  const meta = doc.metadata as RepositoryMetadata;

  const [health, languages, contributors, activity, pullsIssues] = await Promise.all([
    settle(getHealthScore(githubId)),
    settle(getLanguages(githubId)),
    settle(getContributors(githubId)),
    settle(getActivity(githubId)),
    settle(getPullsIssues(githubId)),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    source: 'GitInsight: read-only analytics from public GitHub data',
    repository: {
      fullName: meta.fullName,
      description: meta.description,
      url: meta.url,
      homepage: meta.homepage,
      owner: meta.owner.login,
      stars: meta.stars,
      forks: meta.forks,
      watchers: meta.watchers,
      openIssuesIncludingPullRequests: meta.openIssues,
      primaryLanguage: meta.language,
      license: meta.license?.spdxId ?? meta.license?.name ?? null,
      sizeKb: meta.sizeKb,
      defaultBranch: meta.defaultBranch,
      createdAt: meta.createdAt,
      lastPush: meta.pushedAt,
      archived: meta.archived,
      topics: meta.topics,
    },
    health: health && {
      score: health.score,
      grade: health.grade,
      formulaVersion: health.formulaVersion,
      components: health.components.map((c) => ({ name: c.label, score: c.score, basis: c.score === null ? [c.reason ?? ''] : c.basis })),
    },
    languages: languages?.languages ?? null,
    topContributors: contributors && { total: contributors.totalContributors, top: contributors.contributors.map((c) => ({ login: c.login, commits: c.commits })) },
    commitsPerMonth: activity && { window: `${activity.windowStart} to ${activity.windowEnd} (UTC)`, months: activity.monthly },
    commitsByWeekday: activity?.weekday ?? null,
    openPullRequestsAndIssues: pullsIssues,
  };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

// ---- CSV ----

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // Prefix formula-looking values so spreadsheets never execute them.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(r: Report): string {
  const rows: unknown[][] = [['section', 'metric', 'value']];
  for (const [k, v] of Object.entries(r.repository)) rows.push(['repository', k, Array.isArray(v) ? v.join('; ') : v]);
  if (r.health) {
    rows.push(['health', 'score', r.health.score ?? 'not available'], ['health', 'grade', r.health.grade ?? '']);
    for (const c of r.health.components) rows.push(['health', c.name, c.score ?? 'not available']);
  }
  for (const l of r.languages ?? []) rows.push(['languages', l.name, `${l.percent}%`]);
  for (const c of r.topContributors?.top ?? []) rows.push(['contributors', c.login, c.commits]);
  for (const m of r.commitsPerMonth?.months ?? []) rows.push(['commits_per_month', m.month, m.commits]);
  for (const d of r.commitsByWeekday ?? []) rows.push(['commits_by_weekday', d.day, d.commits]);
  if (r.openPullRequestsAndIssues) {
    rows.push(['pull_requests_issues', 'open_pull_requests', r.openPullRequestsAndIssues.openPullRequests]);
    rows.push(['pull_requests_issues', 'open_issues', r.openPullRequestsAndIssues.openIssues]);
  }
  rows.push(['meta', 'generated_at', r.generatedAt], ['meta', 'source', r.source]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

// ---- PDF ----

const INK = '#18181b';
const MUTED = '#71717a';
const LINE = '#e4e4e7';
const ACCENT = '#059669';
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const fmt = (n: number) => n.toLocaleString('en');

export function toPdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: `${r.repository.fullName}: GitInsight report`, Author: 'GitInsight' } });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const left = 50;
    const width = pdf.page.width - 100;
    const heading = (text: string) => {
      if (pdf.y > pdf.page.height - 120) pdf.addPage();
      pdf.moveDown(1.2).fillColor(INK).font('Helvetica-Bold').fontSize(12).text(text, left);
      pdf.moveDown(0.4);
    };

    // Header band
    pdf.rect(0, 0, pdf.page.width, 110).fill(INK);
    pdf.fillColor('#34d399').font('Helvetica-Bold').fontSize(9).text('GITINSIGHT REPOSITORY REPORT', left, 32, { characterSpacing: 1.5 });
    pdf.fillColor('white').font('Helvetica-Bold').fontSize(22).text(r.repository.fullName, left, 48, { width });
    pdf.fillColor('#a1a1aa').font('Helvetica').fontSize(9).text(`Generated ${new Date(r.generatedAt).toUTCString()}`, left, 80);

    pdf.y = 130;
    pdf.fillColor(INK).font('Helvetica').fontSize(11).text(r.repository.description ?? 'No description specified.', left, 130, { width });

    // Stat tiles
    const tiles: [string, number | null][] = [
      ['Stars', r.repository.stars],
      ['Forks', r.repository.forks],
      ['Watchers', r.repository.watchers],
      ['Open issues + PRs', r.repository.openIssuesIncludingPullRequests],
    ];
    const tileY = pdf.y + 16;
    const tileW = (width - 30) / 4;
    tiles.forEach(([label, value], i) => {
      const x = left + i * (tileW + 10);
      pdf.roundedRect(x, tileY, tileW, 52, 6).lineWidth(1).stroke(LINE);
      pdf.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x + 10, tileY + 10, { width: tileW - 20 });
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(value === null ? 'n/a' : fmt(value), x + 10, tileY + 24, { width: tileW - 20 });
    });
    pdf.y = tileY + 64;

    const facts = [
      ['Primary language', r.repository.primaryLanguage ?? 'Not specified'],
      ['License', r.repository.license ?? 'Not specified'],
      ['Default branch', r.repository.defaultBranch],
      ['Created', r.repository.createdAt.slice(0, 10)],
      ['Last push', r.repository.lastPush?.slice(0, 10) ?? 'Not specified'],
      ['Size', `${(r.repository.sizeKb / 1024).toFixed(1)} MB`],
    ];
    const gridY = pdf.y;
    facts.forEach(([label, value], i) => {
      const x = left + (i % 3) * (width / 3);
      const y = gridY + Math.floor(i / 3) * 30;
      pdf.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x, y, { width: width / 3 - 10, lineBreak: false });
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(value, x, y + 11, { width: width / 3 - 10, lineBreak: false });
    });
    pdf.y = gridY + 64;

    // Health
    if (r.health) {
      heading('Repository health');
      const y = pdf.y;
      pdf.circle(left + 34, y + 34, 32).lineWidth(6).stroke(LINE);
      if (r.health.score !== null) {
        const end = -Math.PI / 2 + (2 * Math.PI * r.health.score) / 100;
        const sx = left + 34;
        const sy = y + 34;
        pdf.path(`M ${sx} ${sy - 32} A 32 32 0 ${r.health.score > 50 ? 1 : 0} 1 ${sx + 32 * Math.cos(end)} ${sy + 32 * Math.sin(end)}`).lineWidth(6).stroke(ACCENT);
      }
      pdf.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(r.health.score === null ? 'n/a' : String(r.health.score), left, y + 26, { width: 68, align: 'center' });
      pdf.font('Helvetica').fontSize(9).fillColor(MUTED).text(r.health.grade ?? 'Not available', left, y + 74, { width: 68, align: 'center' });

      const barX = left + 100;
      const barW = width - 180;
      r.health.components.forEach((c, i) => {
        const rowY = y + i * 22;
        pdf.fillColor(INK).font('Helvetica').fontSize(9).text(c.name, barX, rowY + 2, { width: 70 });
        pdf.roundedRect(barX + 72, rowY + 4, barW, 6, 3).fill('#f4f4f5');
        if (c.score !== null) pdf.roundedRect(barX + 72, rowY + 4, Math.max(6, (barW * c.score) / 100), 6, 3).fill(ACCENT);
        pdf.fillColor(INK).font('Helvetica-Bold').text(c.score === null ? 'n/a' : String(c.score), barX + 80 + barW, rowY + 2);
      });
      pdf.y = y + 96;
      pdf.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Equal-weight average of the measurable signals (formula v${r.health.formulaVersion}).`, left);
    }

    // Languages
    if (r.languages?.length) {
      heading('Languages');
      const y = pdf.y;
      let x = left;
      r.languages.forEach((l, i) => {
        const w = (width * l.percent) / 100;
        if (w > 0) pdf.rect(x, y, Math.max(w - 1, 0.5), 10).fill(l.name === 'Other' ? '#a1a1aa' : SERIES[i % SERIES.length]);
        x += w;
      });
      pdf.y = y + 18;
      r.languages.forEach((l, i) => {
        const col = i % 3;
        const rowY = pdf.y + Math.floor(i / 3) * 14;
        const lx = left + col * (width / 3);
        pdf.circle(lx + 4, rowY + 4, 3).fill(l.name === 'Other' ? '#a1a1aa' : SERIES[i % SERIES.length]);
        pdf.fillColor(INK).font('Helvetica').fontSize(9).text(`${l.name}  ${l.percent.toFixed(1)}%`, lx + 12, rowY, { lineBreak: false });
      });
      pdf.y += Math.ceil(r.languages.length / 3) * 14 + 4;
    }

    // Commits per month
    if (r.commitsPerMonth) {
      heading('Commits per month');
      const months = r.commitsPerMonth.months;
      const max = Math.max(1, ...months.map((m) => m.commits));
      const chartH = 90;
      // Room above the tallest bar for its value label.
      const y = pdf.y + 12;
      const slot = width / months.length;
      pdf.moveTo(left, y + chartH).lineTo(left + width, y + chartH).lineWidth(0.5).stroke(LINE);
      months.forEach((m, i) => {
        const h = (chartH * m.commits) / max;
        const x = left + i * slot + slot * 0.2;
        if (h > 0) pdf.roundedRect(x, y + chartH - h, slot * 0.6, h, 2).fill(ACCENT);
        pdf.fillColor(INK).font('Helvetica').fontSize(7).text(fmt(m.commits), left + i * slot, y + chartH - h - 10, { width: slot, align: 'center' });
        const label = new Date(`${m.month}-01T00:00:00Z`).toLocaleDateString('en', { month: 'short', timeZone: 'UTC' });
        pdf.fillColor(MUTED).text(label, left + i * slot, y + chartH + 4, { width: slot, align: 'center' });
      });
      pdf.y = y + chartH + 18;
      pdf.fillColor(MUTED).fontSize(8).text(`Default branch, ${r.commitsPerMonth.window}.`, left);
    }

    // Contributors and PRs/issues
    if (r.topContributors?.top.length) {
      heading(`Top contributors (${fmt(r.topContributors.total)} in total)`);
      const max = r.topContributors.top[0].commits || 1;
      r.topContributors.top.forEach((c) => {
        if (pdf.y > pdf.page.height - 80) pdf.addPage();
        const y = pdf.y;
        pdf.fillColor(INK).font('Helvetica').fontSize(9).text(c.login, left, y, { width: 130, lineBreak: false });
        pdf.roundedRect(left + 135, y + 2, ((width - 200) * c.commits) / max, 7, 2).fill('#2a78d6');
        pdf.fillColor(INK).font('Helvetica-Bold').text(fmt(c.commits), left + width - 55, y, { width: 55, align: 'right' });
        pdf.y = y + 15;
      });
    }
    if (r.openPullRequestsAndIssues) {
      heading('Open pull requests and issues');
      pdf.font('Helvetica').fontSize(10).fillColor(INK).text(
        `${fmt(r.openPullRequestsAndIssues.openPullRequests)} open pull requests and ${fmt(r.openPullRequestsAndIssues.openIssues)} open issues (counted separately).`,
        left,
      );
    }

    // Footer on every page
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      // The footer sits inside the bottom margin; without this pdfkit would start a new page for it.
      pdf.page.margins.bottom = 0;
      pdf.fillColor(MUTED).font('Helvetica').fontSize(7).text(
        `${r.source}. ${r.repository.url}    Page ${i + 1} of ${range.count}`,
        left,
        pdf.page.height - 36,
        { width, align: 'center', lineBreak: false },
      );
    }
    pdf.end();
  });
}

export async function exportReport(githubId: number, format: ExportFormat) {
  const report = await buildReport(githubId);
  const base = `${report.repository.fullName.replace('/', '-')}-gitinsight-${report.generatedAt.slice(0, 10)}`;
  if (format === 'json') return { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json', filename: `${base}.json`, label: report.repository.fullName };
  if (format === 'csv') return { body: Buffer.from(toCsv(report)), contentType: 'text/csv; charset=utf-8', filename: `${base}.csv`, label: report.repository.fullName };
  return { body: await toPdf(report), contentType: 'application/pdf', filename: `${base}.pdf`, label: report.repository.fullName };
}
