import mongoose from 'mongoose';

/**
 * One row per (campaign, student). This is the unit of work the queue processes
 * and the source of truth for Module 5 (Message Tracking & Delivery Monitoring).
 */
const campaignMessageSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    phone: { type: String, required: true },

    // Final rendered text for this recipient (after {{var}} substitution).
    body: { type: String },

    // Provider message id (Meta returns "wamid.xxx"); used to correlate webhooks.
    messageId: { type: String, index: true },

    status: {
      type: String,
      enum: ['pending', 'queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'pending',
      index: true,
    },

    queuedAt: { type: Date },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    readAt: { type: Date },
    failedAt: { type: Date },

    error: { type: String, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// A student should appear at most once per campaign — guards against duplicate enqueues.
campaignMessageSchema.index({ campaignId: 1, studentId: 1 }, { unique: true, sparse: true });
// Fast filtering on the tracking screen (e.g. "show failed for this campaign").
campaignMessageSchema.index({ campaignId: 1, status: 1 });

export const CampaignMessage = mongoose.model('CampaignMessage', campaignMessageSchema);
export default CampaignMessage;
