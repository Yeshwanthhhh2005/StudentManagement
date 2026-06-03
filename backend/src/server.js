import http from 'http';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { attachRealtime } from './queues/realtime.js';
import { startScheduler } from './services/scheduler.js';
import { logger } from './utils/logger.js';

async function start() {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  // Socket.IO for real-time dashboard/tracking updates (Module 5/6).
  attachRealtime(server);

  // In-process scheduler for scheduled campaigns (Module 2).
  startScheduler();

  server.listen(env.port, () => {
    logger.info(`API listening on http://localhost:${env.port} (provider=${env.whatsappProvider})`);
  });
}

start().catch((err) => {
  logger.error('Server failed to start', err);
  process.exit(1);
});
