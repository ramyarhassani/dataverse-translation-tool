import { log } from '../components/debug-log';

const RETRY_DELAYS = [2000, 4000, 8000]; // exponential backoff

/**
 * Retry wrapper for Dataverse API calls with exponential backoff.
 * Retries on timeout/throttling errors (common with large exports).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes('timeout') ||
        msg.includes('Timeout') ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('throttl') ||
        msg.includes('ECONNRESET') ||
        msg.includes('network');

      if (!isRetryable || attempt >= maxRetries) {
        throw err;
      }

      const delay = RETRY_DELAYS[attempt] || 8000;
      log('warn', `${label}: retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`, msg);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error(`${label}: max retries exceeded`);
}
