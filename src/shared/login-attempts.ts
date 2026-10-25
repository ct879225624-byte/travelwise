// ponytail: one process / one administrator; use a shared limiter before scaling replicas.
export function createLoginAttemptLimiter(limit = 10, windowMs = 15 * 60 * 1000) {
  let attempts = 0;
  let resetAt = 0;
  return {
    consume(now = Date.now()) {
      if (now >= resetAt) { attempts = 0; resetAt = now + windowMs; }
      if (attempts >= limit) return false;
      // Reserve before bcrypt so concurrent requests cannot bypass the limit.
      attempts += 1;
      return true;
    },
    success() { attempts = 0; },
  };
}
