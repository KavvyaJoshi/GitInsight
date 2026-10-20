import { isValidObjectId, type Types } from 'mongoose';
import { HttpError } from '../lib/errors';
import { Bookmark, Collection, ComparisonSet, SearchHistory } from '../models/Personal';
import { Repository, type RepositoryMetadata } from '../models/Repository';

const HISTORY_LIMIT = 500;
// A repeat search of the same repository within this window refreshes the entry instead of duplicating it.
const HISTORY_COLLAPSE_MS = 2 * 60_000;

const isDuplicateKey = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

function objectId(id: string, what: string): string {
  if (!isValidObjectId(id)) throw notFound(what);
  return id;
}

// ---- Collections & bookmarks (REQ-PERS-001) ----

export async function listCollections(userId: Types.ObjectId) {
  const [collections, bookmarks] = await Promise.all([
    Collection.find({ userId }).sort({ createdAt: 1 }).lean(),
    Bookmark.find({ userId }).sort({ createdAt: 1 }).lean(),
  ]);
  return collections.map((c) => ({
    id: String(c._id),
    name: c.name,
    createdAt: c.createdAt,
    bookmarks: bookmarks
      .filter((b) => String(b.collectionId) === String(c._id))
      .map((b) => ({
        id: String(b._id),
        githubId: b.githubId,
        fullName: b.fullName,
        description: b.description,
        language: b.language,
        stars: b.stars,
        avatarUrl: b.avatarUrl,
        createdAt: b.createdAt,
      })),
  }));
}

export async function createCollection(userId: Types.ObjectId, name: string) {
  try {
    const c = await Collection.create({ userId, name, nameLower: name.toLowerCase() });
    return { id: String(c._id), name: c.name, createdAt: c.createdAt, bookmarks: [] };
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'COLLECTION_EXISTS', `You already have a collection called “${name}”.`);
    throw err;
  }
}

export async function renameCollection(userId: Types.ObjectId, id: string, name: string) {
  try {
    const c = await Collection.findOneAndUpdate({ _id: objectId(id, 'Collection'), userId }, { name, nameLower: name.toLowerCase() }, { returnDocument: 'after' });
    if (!c) throw notFound('Collection');
    return { id: String(c._id), name: c.name };
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'COLLECTION_EXISTS', `You already have a collection called “${name}”.`);
    throw err;
  }
}

export async function deleteCollection(userId: Types.ObjectId, id: string) {
  const c = await Collection.findOneAndDelete({ _id: objectId(id, 'Collection'), userId });
  if (!c) throw notFound('Collection');
  await Bookmark.deleteMany({ userId, collectionId: c._id });
}

export async function addBookmark(userId: Types.ObjectId, input: { githubId: number; collectionId?: string; newCollectionName?: string }) {
  const repo = await Repository.findOne({ githubId: input.githubId }).select('metadata').lean();
  if (!repo) throw new HttpError(404, 'REPO_NOT_FOUND', 'Search for this repository before bookmarking it.');
  const meta = repo.metadata as RepositoryMetadata;

  let collectionId = input.collectionId;
  if (input.newCollectionName) {
    collectionId = (await createCollection(userId, input.newCollectionName)).id;
  } else if (!collectionId || !(await Collection.exists({ _id: objectId(collectionId, 'Collection'), userId }))) {
    throw notFound('Collection');
  }

  try {
    const b = await Bookmark.create({
      userId,
      collectionId,
      githubId: meta.id,
      fullName: meta.fullName,
      description: meta.description,
      language: meta.language,
      stars: meta.stars,
      avatarUrl: meta.owner.avatarUrl,
    });
    return { id: String(b._id), collectionId, githubId: b.githubId };
  } catch (err) {
    if (isDuplicateKey(err)) throw new HttpError(409, 'ALREADY_BOOKMARKED', `${meta.fullName} is already in that collection.`);
    throw err;
  }
}

export async function removeBookmark(userId: Types.ObjectId, id: string) {
  const b = await Bookmark.findOneAndDelete({ _id: objectId(id, 'Bookmark'), userId });
  if (!b) throw notFound('Bookmark');
}

/** Which of the user's collections already hold this repository (drives the bookmark button state). */
export async function bookmarksForRepository(userId: Types.ObjectId, githubId: number) {
  const list = await Bookmark.find({ userId, githubId }).select('collectionId').lean();
  return list.map((b) => ({ id: String(b._id), collectionId: String(b.collectionId) }));
}

// ---- Search history (REQ-PERS-002) ----

export async function recordSearch(userId: Types.ObjectId, repo: RepositoryMetadata): Promise<void> {
  try {
    const last = await SearchHistory.findOne({ userId }).sort({ searchedAt: -1 });
    if (last && last.githubId === repo.id && Date.now() - last.searchedAt.getTime() < HISTORY_COLLAPSE_MS) {
      last.searchedAt = new Date();
      last.fullName = repo.fullName;
      await last.save();
      return;
    }
    await SearchHistory.create({ userId, githubId: repo.id, fullName: repo.fullName, searchedAt: new Date() });
    // Keep only the newest 500 entries.
    const overflow = await SearchHistory.find({ userId }).sort({ searchedAt: -1 }).skip(HISTORY_LIMIT).select('_id').lean();
    if (overflow.length) await SearchHistory.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
  } catch (err) {
    // History is a convenience; it must never break the search itself.
    console.error('Failed to record search history:', err);
  }
}

export async function listHistory(userId: Types.ObjectId, limit: number, before?: Date) {
  const entries = await SearchHistory.find({ userId, ...(before ? { searchedAt: { $lt: before } } : {}) })
    .sort({ searchedAt: -1 })
    .limit(limit + 1)
    .lean();
  return {
    entries: entries.slice(0, limit).map((e) => ({ id: String(e._id), githubId: e.githubId, fullName: e.fullName, searchedAt: e.searchedAt })),
    hasMore: entries.length > limit,
  };
}

export async function deleteHistoryEntry(userId: Types.ObjectId, id: string) {
  const e = await SearchHistory.findOneAndDelete({ _id: objectId(id, 'History entry'), userId });
  if (!e) throw notFound('History entry');
}

export async function clearHistory(userId: Types.ObjectId) {
  await SearchHistory.deleteMany({ userId });
}

// ---- Saved comparison sets (REQ-COMP-004) ----

export async function listComparisonSets(userId: Types.ObjectId) {
  const sets = await ComparisonSet.find({ userId }).sort({ updatedAt: -1 }).lean();
  return sets.map((s) => ({ id: String(s._id), name: s.name, repos: s.repos.map((r) => r.fullName), updatedAt: s.updatedAt }));
}

export async function saveComparisonSet(userId: Types.ObjectId, name: string, githubIds: number[]) {
  const repos = await Repository.find({ githubId: { $in: githubIds } }).select('githubId fullName').lean();
  if (repos.length !== githubIds.length) throw new HttpError(404, 'REPO_NOT_FOUND', 'Compare these repositories before saving the set.');
  const ordered = githubIds.map((id) => repos.find((r) => r.githubId === id)!);
  const set = await ComparisonSet.create({ userId, name, repos: ordered.map((r) => ({ githubId: r.githubId, fullName: r.fullName })) });
  return { id: String(set._id), name: set.name, repos: set.repos.map((r) => r.fullName), updatedAt: set.updatedAt };
}

export async function deleteComparisonSet(userId: Types.ObjectId, id: string) {
  const s = await ComparisonSet.findOneAndDelete({ _id: objectId(id, 'Comparison set'), userId });
  if (!s) throw notFound('Comparison set');
}
