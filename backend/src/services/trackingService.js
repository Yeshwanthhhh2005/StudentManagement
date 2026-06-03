import { CampaignMessage } from '../models/CampaignMessage.js';
import { refreshCampaignCounters } from './campaignService.js';
import { emitEvent } from '../queues/realtime.js';
import { logger } from '../utils/logger.js';

// Status ranking — webhooks can arrive out of order; never downgrade a message.
const RANK = { pending: 0, queued: 1, sent: 2, delivered: 3, read: 4, failed: 5 };

const TIMESTAMP_FIELD = {
  sent: 'sentAt',
  delivered: 'deliveredAt',
  read: 'readAt',
  failed: 'failedAt',
};

/**
 * Apply a batch of normalised status events (from any provider's parseWebhook).
 * Correlates on provider messageId, guards against out-of-order/duplicate
 * delivery receipts, and refreshes affected campaigns' counters.
 */
export async function applyStatusEvents(events) {
  const affectedCampaigns = new Set();

  for (const evt of events) {
    if (!evt.messageId || !evt.status) continue;

    const msg = await CampaignMessage.findOne({ messageId: evt.messageId });
    if (!msg) {
      logger.debug(`Webhook for unknown messageId ${evt.messageId} — ignored`);
      continue;
    }

    const incomingRank = RANK[evt.status] ?? -1;
    const currentRank = RANK[msg.status] ?? -1;
    // 'read' implies 'delivered'; 'failed' always wins. Otherwise only move forward.
    if (evt.status !== 'failed' && incomingRank <= currentRank) continue;

    msg.status = evt.status;
    const tsField = TIMESTAMP_FIELD[evt.status];
    if (tsField) msg[tsField] = evt.timestamp || new Date();
    if (evt.status === 'failed') msg.error = evt.error || 'delivery failed';
    await msg.save();

    affectedCampaigns.add(String(msg.campaignId));
    emitEvent('message:status', {
      campaignId: String(msg.campaignId),
      campaignMessageId: String(msg._id),
      status: evt.status,
    });
  }

  // Recompute denormalised counters once per affected campaign.
  for (const campaignId of affectedCampaigns) {
    await refreshCampaignCounters(campaignId);
  }

  return { processed: events.length, affectedCampaigns: [...affectedCampaigns] };
}

export default { applyStatusEvents };
