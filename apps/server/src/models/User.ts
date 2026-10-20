import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true, default: '' },
    // Never selected by default so it cannot leak into responses.
    passwordHash: { type: String, select: false },
    hasPassword: { type: Boolean, default: false, required: true },
    googleId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: ROLES, default: 'user', required: true },
    status: { type: String, enum: ['active', 'deactivated'], default: 'active', required: true },
    failedLoginCount: { type: Number, default: 0, required: true },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date },
    // Persisted across sessions and devices (REQ-PERS-007).
    preferences: {
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      defaultView: { type: String, enum: ['chart', 'table'], default: 'chart' },
      digest: { type: String, enum: ['off', 'daily', 'weekly'], default: 'off' },
    },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);

export function toPublicUser(user: UserDoc) {
  return {
    id: user.id as string,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    passwordSet: user.hasPassword,
    googleLinked: Boolean(user.googleId),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
    preferences: {
      theme: user.preferences?.theme ?? 'system',
      defaultView: user.preferences?.defaultView ?? 'chart',
      digest: user.preferences?.digest ?? 'off',
    },
  };
}
