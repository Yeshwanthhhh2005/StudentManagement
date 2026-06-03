import { BaseProvider } from './BaseProvider.js';
import { logger } from '../../utils/logger.js';

/**
 * Mock provider for local development / load-testing without burning real
 * WhatsApp credits. Returns a fake wamid and (optionally) simulates async
 * delivery+read callbacks. Selected via WHATSAPP_PROVIDER=mock.
 */
export class MockProvider extends BaseProvider {
  constructor({ onStatus } = {}) {
    super();
    this.onStatus = onStatus; // optional callback to simulate webhooks
  }

  isConfigured() {
    return true;
  }

  async sendMessage({ to }) {
    const messageId = `wamid.mock.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
    logger.debug(`[MockProvider] sent to ${to} -> ${messageId}`);

    // Simulate delivery then read receipts a moment later.
    if (this.onStatus) {
      setTimeout(() => this.onStatus({ messageId, status: 'delivered', timestamp: new Date() }), 800);
      setTimeout(() => this.onStatus({ messageId, status: 'read', timestamp: new Date() }), 2000);
    }

    return { messageId, status: 'sent' };
  }

  parseWebhook(payload) {
    // Mock webhooks already arrive in normalised shape.
    return Array.isArray(payload?.events) ? payload.events : [];
  }
}

export default MockProvider;
