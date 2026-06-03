import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { env } from '../config/env.js';

export const MESSAGE_QUEUE_NAME = 'whatsapp-messages';

/**
 * The send queue (Module 3). One job == one WhatsApp message == one
 * CampaignMessage row. Defaults give us automatic retries with exponential
 * backoff, satisfying "Supports retry mechanisms for failed deliveries".
 */
export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: env.queue.jobMaxAttempts,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600, count: 10000 }, // keep recent for inspection
    removeOnFail: { age: 24 * 3600 },
  },
});

/**
 * Enqueue messages in bulk. Designed for 300K-scale campaigns: callers pass
 * batches (e.g. 1–5k) of pre-built job payloads rather than one add() per row.
 * @param {Array<{ name: string, data: object, opts?: object }>} jobs
 */
export async function addMessageJobs(jobs) {
  if (!jobs.length) return [];
  return messageQueue.addBulk(jobs);
}

export default messageQueue;
