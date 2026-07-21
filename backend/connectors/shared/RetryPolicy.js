/**
 * Journey #7 — Retry only transient connector failures.
 */

const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const NON_RETRY_STATUS_CODES = new Set([401, 403, 404]);

function isTransientError(error) {
  if (!error) {
    return false;
  }

  const status = error.status || error.response?.status || error.statusCode;

  if (status && NON_RETRY_STATUS_CODES.has(status)) {
    return false;
  }

  if (status && TRANSIENT_STATUS_CODES.has(status)) {
    return true;
  }

  const code = error.code || "";
  return ["ETIMEDOUT", "ECONNRESET", "ECONNABORTED", "ENOTFOUND"].includes(code);
}

/**
 * @param {Function} fn
 * @param {Object} [options]
 * @param {number} [options.maxAttempts]
 * @param {number} [options.baseDelayMs]
 * @param {Function} [options.onRetry]
 * @returns {Promise<{ result: *, retries: number }>}
 */
async function executeWithRetry(fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let retries = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await fn();
      return { result, retries };
    } catch (error) {
      const canRetry = attempt < maxAttempts && isTransientError(error);

      if (!canRetry) {
        throw error;
      }

      retries += 1;
      options.onRetry?.({ attempt, retries, error });

      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw new Error("Retry policy exhausted");
}

module.exports = {
  TRANSIENT_STATUS_CODES,
  NON_RETRY_STATUS_CODES,
  isTransientError,
  executeWithRetry
};
