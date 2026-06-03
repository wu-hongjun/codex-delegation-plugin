/**
 * Retry a function up to `attempts` times on error.
 * @param {() => any} fn
 * @param {number} attempts
 * @returns {any}
 */
export function withRetry(fn, attempts) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
