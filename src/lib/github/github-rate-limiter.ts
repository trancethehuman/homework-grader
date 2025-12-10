interface RateLimitState {
  remaining: number;
  reset: number;
  limit: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelayMs: 2000,
  maxDelayMs: 120000,
};

const WRITE_OPERATION_DELAY_MS = 2000;
const SECONDARY_RATE_LIMIT_COOLDOWN_MS = 65000;

export class GitHubRateLimiter {
  private rateLimitState: RateLimitState | null = null;
  private lastRequestTime: number = 0;
  private writeOperationCount: number = 0;
  private writeOperationWindowStart: number = 0;
  private consecutiveErrors: number = 0;
  private readonly writeOperationsPerMinute = 30;

  updateFromHeaders(headers: Record<string, string | number | undefined>): void {
    const remaining = headers["x-ratelimit-remaining"];
    const reset = headers["x-ratelimit-reset"];
    const limit = headers["x-ratelimit-limit"];

    if (remaining !== undefined && reset !== undefined && limit !== undefined) {
      this.rateLimitState = {
        remaining: Number(remaining),
        reset: Number(reset),
        limit: Number(limit),
      };
    }
  }

  getRateLimitState(): RateLimitState | null {
    return this.rateLimitState;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, config.maxDelayMs);
  }

  private async waitForPrimaryRateLimit(): Promise<void> {
    if (!this.rateLimitState) return;

    if (this.rateLimitState.remaining <= 0) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = (this.rateLimitState.reset - now + 1) * 1000;

      if (waitTime > 0) {
        const waitSeconds = Math.ceil(waitTime / 1000);
        console.log(
          `Primary rate limit reached. Waiting ${waitSeconds} seconds until reset...`
        );
        await this.sleep(waitTime);
      }
    }
  }

  private async enforceWriteOperationThrottle(): Promise<void> {
    const now = Date.now();

    if (now - this.writeOperationWindowStart > 60000) {
      this.writeOperationCount = 0;
      this.writeOperationWindowStart = now;
      this.consecutiveErrors = 0;
    }

    if (this.writeOperationCount >= this.writeOperationsPerMinute) {
      const waitTime = 60000 - (now - this.writeOperationWindowStart) + 5000;
      if (waitTime > 0) {
        console.log(
          `Write operation limit reached (${this.writeOperationCount}/${this.writeOperationsPerMinute}). Waiting ${Math.ceil(waitTime / 1000)} seconds...`
        );
        await this.sleep(waitTime);
        this.writeOperationCount = 0;
        this.writeOperationWindowStart = Date.now();
      }
    }

    const adaptiveDelay =
      WRITE_OPERATION_DELAY_MS + this.consecutiveErrors * 1000;
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < adaptiveDelay) {
      await this.sleep(adaptiveDelay - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    this.writeOperationCount++;
  }

  private isSecondaryRateLimitError(error: any): boolean {
    if (error.status === 403 || error.status === 429) {
      const message = (error.message || "").toLowerCase();
      const responseMessage = (
        error.response?.data?.message || ""
      ).toLowerCase();

      return (
        message.includes("secondary rate limit") ||
        message.includes("abuse") ||
        message.includes("too many requests") ||
        responseMessage.includes("secondary rate limit") ||
        responseMessage.includes("abuse") ||
        responseMessage.includes("too many requests")
      );
    }
    return false;
  }

  private isPrimaryRateLimitError(error: any): boolean {
    if (error.status === 403 || error.status === 429) {
      const message = (error.message || "").toLowerCase();
      return (
        message.includes("rate limit") && !message.includes("secondary")
      );
    }
    return false;
  }

  private getRetryAfterFromError(error: any): number | null {
    const retryAfter = error.response?.headers?.["retry-after"];
    if (retryAfter) {
      return parseInt(retryAfter, 10) * 1000;
    }

    const resetTime = error.response?.headers?.["x-ratelimit-reset"];
    if (resetTime) {
      const now = Math.floor(Date.now() / 1000);
      const waitTime = (parseInt(resetTime, 10) - now + 1) * 1000;
      return Math.max(waitTime, 0);
    }

    return null;
  }

  async executeWithRetry<T>(
    apiCall: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    isWriteOperation: boolean = false
  ): Promise<T> {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: any;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        await this.waitForPrimaryRateLimit();

        if (isWriteOperation) {
          await this.enforceWriteOperationThrottle();
        }

        const response = await apiCall();

        if (response && typeof response === "object" && "headers" in response) {
          this.updateFromHeaders(
            (response as any).headers as Record<string, string | number>
          );
        }

        this.consecutiveErrors = 0;
        return response;
      } catch (error: any) {
        lastError = error;

        if (error.response?.headers) {
          this.updateFromHeaders(error.response.headers);
        }

        if (this.isSecondaryRateLimitError(error)) {
          this.consecutiveErrors++;

          if (attempt >= retryConfig.maxRetries) {
            throw new Error(
              `Secondary rate limit exceeded after ${retryConfig.maxRetries} retries: ${error.message}`
            );
          }

          const retryAfter = this.getRetryAfterFromError(error);
          const delay =
            retryAfter ||
            Math.max(
              this.calculateBackoffDelay(attempt, retryConfig),
              SECONDARY_RATE_LIMIT_COOLDOWN_MS
            );

          console.log(
            `Secondary rate limit hit. Attempt ${attempt + 1}/${retryConfig.maxRetries + 1}. Waiting ${Math.ceil(delay / 1000)} seconds...`
          );

          await this.sleep(delay);
          continue;
        }

        if (this.isPrimaryRateLimitError(error)) {
          this.consecutiveErrors++;

          if (attempt >= retryConfig.maxRetries) {
            throw new Error(
              `Primary rate limit exceeded after ${retryConfig.maxRetries} retries: ${error.message}`
            );
          }

          const retryAfter = this.getRetryAfterFromError(error);
          const delay =
            retryAfter || this.calculateBackoffDelay(attempt, retryConfig);

          console.log(
            `Primary rate limit hit. Attempt ${attempt + 1}/${retryConfig.maxRetries + 1}. Waiting ${Math.ceil(delay / 1000)} seconds...`
          );

          await this.sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError;
  }
}

export const githubRateLimiter = new GitHubRateLimiter();
