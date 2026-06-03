import dotenv from 'dotenv';

dotenv.config();

const toBool = (v) => String(v).toLowerCase() === 'true';
const toInt = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
};

export const env = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wa_campaigns',

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: toInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: toBool(process.env.REDIS_TLS),
  },

  jwtSecret: process.env.JWT_SECRET || 'dev_insecure_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',

  whatsappProvider: (process.env.WHATSAPP_PROVIDER || 'meta').toLowerCase(),

  // Country code prepended to bare local numbers on import (default: India).
  defaultCountryCode: (process.env.DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, ''),

  meta: {
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '',
    accessToken: process.env.META_ACCESS_TOKEN || '',
    wabaId: process.env.META_WABA_ID || '',
    apiVersion: process.env.META_API_VERSION || 'v21.0',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'my_verify_token',
    appSecret: process.env.META_APP_SECRET || '',
  },

  queue: {
    sendRatePerSecond: toInt(process.env.SEND_RATE_PER_SECOND, 50),
    workerConcurrency: toInt(process.env.WORKER_CONCURRENCY, 20),
    jobMaxAttempts: toInt(process.env.JOB_MAX_ATTEMPTS, 3),
  },
};

export default env;
