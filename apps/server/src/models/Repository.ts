import { Schema, model } from 'mongoose';

export interface RepositoryMetadata {
  id: number;
  owner: { login: string; avatarUrl: string; type: string; url: string };
  name: string;
  fullName: string;
  description: string | null;
  url: string;
  homepage: string | null;
  stars: number;
  forks: number;
  watchers: number | null;
  // GitHub's count includes open pull requests; the analytics phase separates them.
  openIssues: number;
  language: string | null;
  license: { spdxId: string | null; name: string } | null;
  sizeKb: number;
  topics: string[];
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  archived: boolean;
  isFork: boolean;
}

// Keyed by GitHub's stable numeric ID so renames and transfers keep the same record.
const repositorySchema = new Schema(
  {
    githubId: { type: Number, required: true, unique: true },
    fullName: { type: String, required: true },
    fullNameLower: { type: String, required: true, index: true },
    metadata: { type: Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, required: true },
    // Computed analytics cached alongside the record (REQ-ANLY-008): { [kind]: { data, computedAt } }.
    analytics: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const Repository = model('Repository', repositorySchema);

// One row per repository per UTC day; Phase 6 derives star/fork growth from these.
const dailySnapshotSchema = new Schema({
  githubId: { type: Number, required: true },
  date: { type: String, required: true },
  stars: { type: Number, required: true },
  forks: { type: Number, required: true },
});
dailySnapshotSchema.index({ githubId: 1, date: 1 }, { unique: true });

export const RepositoryDailySnapshot = model('RepositoryDailySnapshot', dailySnapshotSchema);
