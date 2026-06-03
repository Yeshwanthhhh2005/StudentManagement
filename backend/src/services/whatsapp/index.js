import { env } from '../../config/env.js';
import { MetaProvider } from './MetaProvider.js';
import { MockProvider } from './MockProvider.js';
import { logger } from '../../utils/logger.js';

let provider;

/**
 * Provider factory. Swapping vendors = adding an adapter + a case here; nothing
 * in the queue/worker/webhook layer changes (Module 4 requirement).
 */
export function getProvider() {
  if (provider) return provider;

  switch (env.whatsappProvider) {
    case 'meta':
      provider = new MetaProvider();
      if (!provider.isConfigured()) {
        logger.warn(
          'WHATSAPP_PROVIDER=meta but credentials are missing. ' +
            'Sends will fail until META_PHONE_NUMBER_ID and META_ACCESS_TOKEN are set.'
        );
      }
      break;
    case 'mock':
      provider = new MockProvider();
      logger.warn('Using MOCK WhatsApp provider — no real messages will be sent.');
      break;
    default:
      throw new Error(`Unknown WHATSAPP_PROVIDER: ${env.whatsappProvider}`);
  }

  return provider;
}

export default getProvider;
