import { Schema, model } from 'mongoose';

// Generated AI content keyed by repository, insight type and a hash of every input
// (data, prompt version, model), so it is regenerated only when those change (REQ-AI-004).
const aiInsightSchema = new Schema(
  {
    githubId: { type: Number, required: true },
    type: { type: String, enum: ['summary', 'trend'], required: true },
    inputHash: { type: String, required: true },
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    content: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
aiInsightSchema.index({ githubId: 1, type: 1, inputHash: 1 }, { unique: true });

export const AIInsight = model('AIInsight', aiInsightSchema);
