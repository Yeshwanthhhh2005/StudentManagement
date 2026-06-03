import axios from 'axios';
import { BaseProvider } from './BaseProvider.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Meta WhatsApp Cloud API adapter.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
export class MetaProvider extends BaseProvider {
  constructor() {
    super();
    const { apiVersion, phoneNumberId, accessToken } = env.meta;
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
  }

  isConfigured() {
    return Boolean(this.phoneNumberId && this.accessToken);
  }

  /**
   * Sends either a template message (cold / outside 24h window) or a plain text
   * message (inside an open session). Template is preferred for campaigns.
   */
  async sendMessage({ to, body, template }) {
    if (!this.isConfigured()) {
      throw new Error('Meta provider not configured (set META_PHONE_NUMBER_ID and META_ACCESS_TOKEN)');
    }

    const recipient = to.replace(/[^\d]/g, ''); // Meta expects digits only, no '+'

    let payload;
    if (template?.name) {
      payload = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en_US' },
          components: this.#buildComponents(template.variables),
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { preview_url: false, body },
      };
    }

    try {
      const { data } = await this.http.post(`/${this.phoneNumberId}/messages`, payload);
      const messageId = data?.messages?.[0]?.id;
      return { messageId, status: 'sent' };
    } catch (err) {
      const apiError = err.response?.data?.error;
      // Surface a clean, retry-classifiable error message.
      const message = apiError
        ? `Meta API ${apiError.code}: ${apiError.message}`
        : err.message;
      const e = new Error(message);
      e.retryable = this.#isRetryable(err.response?.status, apiError?.code);
      throw e;
    }
  }

  /**
   * Build the body component for a template send. Positional WhatsApp params
   * ({{1}}, {{2}}...) map to the ordered `variables` array.
   */
  #buildComponents(variables = []) {
    if (!variables.length) return [];
    return [
      {
        type: 'body',
        parameters: variables.map((v) => ({ type: 'text', text: String(v ?? '') })),
      },
    ];
  }

  // 4xx (except 429) are permanent; 429 + 5xx are transient/retryable.
  #isRetryable(httpStatus, apiCode) {
    if (httpStatus === 429) return true;
    if (httpStatus >= 500) return true;
    // 130429 = rate limit hit, 131048 = spam rate limit, 132000 = temporary
    if ([130429, 131048, 132000].includes(apiCode)) return true;
    return false;
  }

  /**
   * Parse Meta's webhook into normalised status events.
   * Meta sends entry[].changes[].value.statuses[] for delivery receipts and
   * .messages[] for inbound messages (ignored here).
   */
  parseWebhook(payload) {
    const events = [];
    const entries = payload?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const statuses = change.value?.statuses || [];
        for (const s of statuses) {
          events.push({
            messageId: s.id,
            // Meta statuses: sent | delivered | read | failed
            status: s.status,
            timestamp: new Date(Number(s.timestamp) * 1000),
            error: s.errors?.[0]?.title || null,
          });
        }
      }
    }
    return events;
  }
}

export default MetaProvider;
