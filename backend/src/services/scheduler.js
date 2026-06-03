import { Campaign } from '../models/Campaign.js';
import { enqueueCampaign, refreshCampaignCounters } from './campaignService.js';
import { logger } from '../utils/logger.js';

const POLL_INTERVAL_MS = 30 * 1000;
const RECONCILE_INTERVAL_MS = 10 * 1000;

/**
 * Lightweight scheduler for "Immediate or scheduled campaign execution"
 * (Module 2). Polls every 30s for campaigns whose scheduledAt has passed and
 * promotes them into the send pipeline. For a single-instance MVP this is
 * sufficient; multi-instance deployments would add a Redis lock here.
 */
export function startScheduler() {
  const tick = async () => {
    try {
      const due = await Campaign.find({
        status: 'scheduled',
        scheduledAt: { $lte: new Date() },
      }).select('_id');

      for (const c of due) {
        // Claim atomically so a duplicate tick can't double-enqueue.
        const claimed = await Campaign.findOneAndUpdate(
          { _id: c._id, status: 'scheduled' },
          { status: 'queued' },
          { new: true }
        );
        if (claimed) {
          logger.info(`Scheduler launching campaign ${claimed._id}`);
          enqueueCampaign(claimed._id).catch((err) =>
            logger.error(`Scheduled enqueue failed for ${claimed._id}`, err)
          );
        }
      }
    } catch (err) {
      logger.error('Scheduler tick failed', err);
    }
  };

  setInterval(tick, POLL_INTERVAL_MS);

  // Reconciler: recompute counters for in-flight campaigns and finalize them
  // once the queue drains. Guarantees completion + accurate dashboard numbers
  // even when delivery webhooks are sparse or absent.
  const reconcile = async () => {
    try {
      const sending = await Campaign.find({ status: 'sending' }).select('_id');
      for (const c of sending) await refreshCampaignCounters(c._id);
    } catch (err) {
      logger.error('Reconciler tick failed', err);
    }
  };
  setInterval(reconcile, RECONCILE_INTERVAL_MS);

  logger.info(
    `Scheduler started (schedule poll ${POLL_INTERVAL_MS / 1000}s, reconcile ${RECONCILE_INTERVAL_MS / 1000}s)`
  );
}

export default startScheduler;
