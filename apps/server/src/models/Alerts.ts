import { Schema, model } from 'mongoose';

export const ALERT_TYPES = ['star_threshold', 'new_release'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

const alertRuleSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    githubId: { type: Number, required: true, index: true },
    fullName: { type: String, required: true },
    type: { type: String, enum: ALERT_TYPES, required: true },
    threshold: { type: Number, default: null },
    active: { type: Boolean, default: true },
    // Evaluation state, so each threshold crossing or release notifies exactly once.
    state: {
      triggered: { type: Boolean, default: false },
      triggerCount: { type: Number, default: 0 },
      lastStars: { type: Number, default: null },
      lastReleaseTag: { type: String, default: null },
    },
    lastCheckedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);
alertRuleSchema.index({ userId: 1, githubId: 1, type: 1, threshold: 1 }, { unique: true });
export const AlertRule = model('AlertRule', alertRuleSchema);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'AlertRule', default: null },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, default: null },
    readAt: { type: Date, default: null },
    // A retried job reuses the same key, so it can never create a second copy.
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
export const Notification = model('Notification', notificationSchema);

/** Short-lived lease so only one process evaluates alerts at a time. */
const jobLockSchema = new Schema({
  name: { type: String, required: true, unique: true },
  lockedUntil: { type: Date, required: true },
});
export const JobLock = model('JobLock', jobLockSchema);
