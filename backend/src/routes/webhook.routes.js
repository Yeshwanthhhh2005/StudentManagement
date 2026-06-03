import express from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { getProvider } from '../services/whatsapp/index.js';
import { applyStatusEvents } from '../services/trackingService.js';
import { logger } from '../utils/logger.js';

export const webhookRouter = express.Router();

/**
 * GET /webhook/whatsapp — Meta webhook verification handshake.
 * Meta calls this once with hub.verify_token; echo hub.challenge if it matches.
 */
webhookRouter.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.meta.webhookVerifyToken) {
    logger.info('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * Verify the X-Hub-Signature-256 header against the raw body using the app
 * secret. Skipped if META_APP_SECRET is not configured (e.g. mock/dev).
 */
function verifySignature(req) {
  if (!env.meta.appSecret) return true; // not enforced when no secret set
  const signature = req.get('x-hub-signature-256');
  if (!signature) return false;
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.meta.appSecret).update(req.rawBody || '').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * POST /webhook/whatsapp — delivery/read/failed status callbacks (Module 5).
 * Respond 200 fast; processing is best-effort and idempotent.
 */
webhookRouter.post('/whatsapp', async (req, res) => {
  if (!verifySignature(req)) {
    logger.warn('Webhook signature verification failed');
    return res.sendStatus(401);
  }

  // Acknowledge immediately so Meta doesn't retry/throttle us.
  res.sendStatus(200);

  try {
    const provider = getProvider();
    const events = provider.parseWebhook(req.body);
    if (events.length) await applyStatusEvents(events);
  } catch (err) {
    logger.error('Failed to process webhook', err);
  }
});

export default webhookRouter;
