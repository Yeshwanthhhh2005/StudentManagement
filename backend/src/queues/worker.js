import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { createRedisConnection } from '../config/redis.js';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { MESSAGE_QUEUE_NAME } from './messageQueue.js';
import { CampaignMessage } from '../models/CampaignMessage.js';
import { Campaign } from '../models/Campaign.js';
import { getProvider } from '../services/whatsapp/index.js';
import { emitEvent } from './realtime.js';
import { logger } from '../utils/logger.js';

/**
 * Worker process (Module 3). Run separately from the API:  `npm run worker`.
 * Scale horizontally by starting more worker processes — BullMQ distributes
 * jobs across them and the queue-level rate limiter is shared via Redis.
 */
async function start() {
  await connectDB();
  const provider = getProvider();

  const worker = new Worker(
    MESSAGE_QUEUE_NAME,
    async (job) => {
      const { campaignMessageId, campaignId, to, body, template } = job.data;

      // Send via the configured provider (Meta by default).
      const { messageId } = await provider.sendMessage({ to, body, template });

      // Mark sent. Delivered/read arrive later via webhook (Module 5).
      await CampaignMessage.findByIdAndUpdate(campaignMessageId, {
        status: 'sent',
        messageId,
        sentAt: new Date(),
        $inc: { attempts: 1 },
        error: null,
      });
      // Keep the denormalised campaign counter live even before any webhook.
      // The reconciler/webhook refresh recomputes the authoritative value later.
      await Campaign.updateOne({ _id: campaignId }, { $inc: { sentCount: 1 } });

      emitEvent('message:status', {
        campaignId,
        campaignMessageId,
        status: 'sent',
        messageId,
      });

      return { messageId };
    },
    {
      connection: createRedisConnection(),
      concurrency: env.queue.workerConcurrency,
      // Shared, Redis-backed rate limiter prevents Meta API rate-limit violations.
      limiter: {
        max: env.queue.sendRatePerSecond,
        duration: 1000,
      },
    }
  );

  // Final failure (all retry attempts exhausted) => record failure for tracking.
  worker.on('failed', async (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts || 1);
    logger.warn(
      `Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${err.message}`
    );
    if (exhausted) {
      const { campaignMessageId, campaignId } = job.data;
      await CampaignMessage.findByIdAndUpdate(campaignMessageId, {
        status: 'failed',
        failedAt: new Date(),
        error: err.message,
        $inc: { attempts: 1 },
      });
      await Campaign.updateOne({ _id: campaignId }, { $inc: { failedCount: 1 } });
      emitEvent('message:status', {
        campaignId,
        campaignMessageId,
        status: 'failed',
        error: err.message,
      });
    }
  });

  worker.on('error', (err) => logger.error('Worker error', err));
  worker.on('ready', () =>
    logger.info(
      `Worker ready — concurrency=${env.queue.workerConcurrency}, rate=${env.queue.sendRatePerSecond}/s, provider=${env.whatsappProvider}`
    )
  );

  const shutdown = async () => {
    logger.info('Worker shutting down...');
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  logger.error('Worker failed to start', err);
  process.exit(1);
});
