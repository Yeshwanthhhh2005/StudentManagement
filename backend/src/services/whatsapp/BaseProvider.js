/**
 * Provider contract. Every WhatsApp provider (Meta, WATI, AiSensy, Interakt,
 * Twilio...) implements this interface, so the queue/worker never depends on a
 * specific vendor — satisfying the "provider flexibility without significant
 * architectural changes" requirement (Module 4).
 */
export class BaseProvider {
  /**
   * Send a single message.
   * @param {object} params
   * @param {string} params.to            E.164 phone, e.g. "+919876543210"
   * @param {string} [params.body]        Plain text (only valid inside 24h session window)
   * @param {object} [params.template]    { name, language, variables: string[] }
   * @returns {Promise<{ messageId: string, status: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async sendMessage(params) {
    throw new Error('sendMessage() not implemented');
  }

  /**
   * Normalise a provider-specific webhook payload into our internal status events.
   * @param {object} payload  Raw webhook body
   * @returns {Array<{ messageId: string, status: string, timestamp: Date, error?: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  parseWebhook(payload) {
    throw new Error('parseWebhook() not implemented');
  }
}

export default BaseProvider;
