import mongoose from 'mongoose';

/**
 * Snapshot of the audience filter used at campaign creation time.
 * Stored so we can re-derive / audit who was targeted.
 */
const segmentSchema = new mongoose.Schema(
  {
    course: String,
    batch: String,
    city: String,
    status: String,
    tags: [String],
    // If set, the campaign targets these explicit student ids instead of a filter.
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageTemplate', required: true },
    // Resolved message body (template content) captured at creation for history.
    message: { type: String, required: true },

    segment: { type: segmentSchema, default: () => ({}) },

    // ── Counters (denormalised for fast dashboard reads) ───────
    totalRecipients: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queued', 'sending', 'completed', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },

    // Immediate vs scheduled execution.
    scheduledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
);

campaignSchema.index({ createdAt: -1 });

// Convenience virtuals for the dashboard (rates as 0..1).
campaignSchema.virtual('deliveryRate').get(function () {
  return this.sentCount ? this.deliveredCount / this.sentCount : 0;
});
campaignSchema.virtual('readRate').get(function () {
  return this.deliveredCount ? this.readCount / this.deliveredCount : 0;
});

campaignSchema.set('toJSON', { virtuals: true });
campaignSchema.set('toObject', { virtuals: true });

export const Campaign = mongoose.model('Campaign', campaignSchema);
export default Campaign;
