import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../../src/lib/retry.js';

describe('RateLimiter', () => {
  it('allows requests within the limit', async () => {
    const limiter = new RateLimiter(5, 1000);
    const start = Date.now();

    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // Should be near-instant
  });

  it('delays when rate limit is reached', async () => {
    const limiter = new RateLimiter(2, 500);

    await limiter.acquire();
    await limiter.acquire();

    const start = Date.now();
    await limiter.acquire(); // This should wait
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(300); // Waited for window to pass
  });
});
