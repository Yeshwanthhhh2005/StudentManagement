import IORedis from 'ioredis';
import { env } from './env.js';

/**
 * A factory so we can create separate connections for the Queue, the Worker,
 * and QueueEvents. BullMQ requires `maxRetriesPerRequest: null` on the
 * connection used by workers/blocking commands.
 */
export function createRedisConnection(extra = {}) {
  return new IORedis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    tls: env.redis.tls ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...extra,
  });
}

export default createRedisConnection;
