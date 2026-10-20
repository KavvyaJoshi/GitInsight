import { Schema, model } from 'mongoose';

// Platform usage counters, one document per key per UTC day.
const usageCounterSchema = new Schema({
  date: { type: String, required: true },
  key: { type: String, required: true },
  count: { type: Number, default: 0 },
});
usageCounterSchema.index({ date: 1, key: 1 }, { unique: true });
export const UsageCounter = model('UsageCounter', usageCounterSchema);

// System activity and administrator audit trail (REQ-ADMIN-004, BR-005). Never holds secrets or passwords.
const activityLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: null },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    targetLabel: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activityLogSchema.index({ createdAt: -1 });
export const ActivityLog = model('ActivityLog', activityLogSchema);
