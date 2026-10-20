import { Schema, model } from 'mongoose';

// Every document here is owned by one user; every query filters by userId.

const collectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    nameLower: { type: String, required: true },
  },
  { timestamps: true },
);
collectionSchema.index({ userId: 1, nameLower: 1 }, { unique: true });
export const Collection = model('Collection', collectionSchema);

// Display fields are copied at bookmark time so the library renders without GitHub calls.
const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
    githubId: { type: Number, required: true },
    fullName: { type: String, required: true },
    description: { type: String, default: null },
    language: { type: String, default: null },
    stars: { type: Number, default: 0 },
    avatarUrl: { type: String, default: '' },
  },
  { timestamps: true },
);
// No duplicate bookmarks within one collection (REQ-PERS-001).
bookmarkSchema.index({ collectionId: 1, githubId: 1 }, { unique: true });
bookmarkSchema.index({ userId: 1, githubId: 1 });
export const Bookmark = model('Bookmark', bookmarkSchema);

const searchHistorySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  githubId: { type: Number, required: true },
  fullName: { type: String, required: true },
  searchedAt: { type: Date, required: true, default: Date.now },
});
searchHistorySchema.index({ userId: 1, searchedAt: -1 });
export const SearchHistory = model('SearchHistory', searchHistorySchema);

const comparisonSetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    repos: {
      type: [{ _id: false, githubId: { type: Number, required: true }, fullName: { type: String, required: true } }],
      validate: { validator: (v: unknown[]) => v.length >= 2 && v.length <= 4, message: 'A comparison needs two to four repositories.' },
    },
  },
  { timestamps: true },
);
export const ComparisonSet = model('ComparisonSet', comparisonSetSchema);
