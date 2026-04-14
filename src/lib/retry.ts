export interface RetryOptions {
  maxRetries?: number;
  retryOnStatuses?: number[];
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
  maxRetries: 3,
  retryOnStatuses: [429, 503],
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { maxRetries, retryOnStatuses, baseDelayMs, maxDelayMs, jitterMs } = {
    ...DEFAULTS,
    ...opts,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (!retryOnStatuses.includes(response.status) || attempt === maxRetries) {
        return response;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * jitterMs,
        maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxRetries) break;

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * jitterMs,
        maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error(`Request to ${url} failed after ${maxRetries} retries`);
}

export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const waitMs = this.windowMs - (now - oldest) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    this.timestamps.push(Date.now());
  }
}
