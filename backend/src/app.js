import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { studentRouter } from './routes/student.routes.js';
import { templateRouter } from './routes/template.routes.js';
import { campaignRouter } from './routes/campaign.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.clientOrigins, credentials: true }));

  // Webhook needs the raw body for signature verification — capture it before JSON parsing.
  app.use(
    '/webhook',
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    })
  );
  app.use('/webhook', webhookRouter);

  // Standard JSON parsing for the rest of the API.
  app.use(express.json({ limit: '5mb' }));

  // Basic abuse protection on the auth endpoint.
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true })
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok', provider: env.whatsappProvider }));

  app.use('/api/auth', authRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/templates', templateRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/analytics', analyticsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export default createApp;
