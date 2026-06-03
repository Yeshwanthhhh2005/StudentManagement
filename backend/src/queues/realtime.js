/**
 * Tiny Socket.IO holder so the API server, worker, and webhook handler can all
 * push real-time status updates to the dashboard (Module 5: "Real-time status
 * updates"). The worker runs in a separate process, so it emits via Redis pub/sub
 * which the API server relays — see attachRealtime() below.
 */
import { Server as SocketServer } from 'socket.io';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const CHANNEL = 'campaign:events';

let io = null;
let publisher = null;

/** Attach Socket.IO to the HTTP server (called from the API process only). */
export function attachRealtime(httpServer) {
  io = new SocketServer(httpServer, {
    cors: { origin: env.clientOrigins, methods: ['GET', 'POST'] },
  });

  // Relay events published by the worker process onto connected sockets.
  const subscriber = new IORedis({
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    tls: env.redis.tls ? {} : undefined,
  });
  subscriber.subscribe(CHANNEL, (err) => {
    if (err) logger.error('Failed to subscribe to realtime channel', err);
  });
  subscriber.on('message', (_channel, raw) => {
    try {
      const evt = JSON.parse(raw);
      io.emit(evt.type, evt.payload);
    } catch {
      /* ignore malformed */
    }
  });

  io.on('connection', (socket) => {
    logger.debug(`Dashboard client connected: ${socket.id}`);
  });

  return io;
}

/** Lazily-create the Redis publisher (works in both API and worker processes). */
function getPublisher() {
  if (!publisher) {
    publisher = new IORedis({
      host: env.redis.host,
      port: env.redis.port,
      password: env.redis.password,
      tls: env.redis.tls ? {} : undefined,
    });
  }
  return publisher;
}

/**
 * Emit an event from anywhere (API or worker process). We always go through
 * Redis pub/sub; the API process's subscriber is the single place that fans
 * events out over Socket.IO, which keeps it to exactly one emit per event.
 */
export function emitEvent(type, payload) {
  getPublisher().publish(CHANNEL, JSON.stringify({ type, payload }));
}

export default { attachRealtime, emitEvent };
