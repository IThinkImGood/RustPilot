import type express from "express";

type RateBucket = {
  count: number;
  resetAt: number;
};

function fail(code: string, message: string, details?: unknown) {
  return { success: false as const, error: { code, message, details } };
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}): express.RequestHandler {
  const buckets = new Map<string, RateBucket>();
  return (req, res, next) => {
    const now = Date.now();
    const remote = req.socket.remoteAddress ?? "unknown";
    const key = `${options.keyPrefix}:${remote}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json(fail("RATE_LIMITED", "Too many requests. Try again shortly.", { retryAfterSeconds }));
      return;
    }
    next();
  };
}
