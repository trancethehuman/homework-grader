import { DebugLogger } from "../utils/debug-logger.js";

export interface TimeoutConfig {
  timeoutMs: number;
  retries?: number;
  retryDelayMs?: number;
  operation?: string;
}

export class ApiTimeoutHandler {
  static readonly DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
  static readonly DEFAULT_RETRIES = 2;
  static readonly DEFAULT_RETRY_DELAY_MS = 1000; // 1 second

  /**
   * Execute a promise with timeout and retry logic
   */
  static async withTimeout<T>(
    promise: () => Promise<T>,
    config: TimeoutConfig
  ): Promise<T> {
    const {
      timeoutMs = ApiTimeoutHandler.DEFAULT_TIMEOUT_MS,
      retries = ApiTimeoutHandler.DEFAULT_RETRIES,
      retryDelayMs = ApiTimeoutHandler.DEFAULT_RETRY_DELAY_MS,
      operation = 'API call'
    } = config;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) {
          DebugLogger.debug(`⏳ Retrying ${operation} (attempt ${attempt + 1}/${retries + 1})`);
          await ApiTimeoutHandler.delay(retryDelayMs * attempt); // Exponential backoff
        }

        DebugLogger.debug(` Starting ${operation} (timeout: ${timeoutMs}ms)`);

        const result = await Promise.race([
          promise(),
          ApiTimeoutHandler.createTimeoutPromise<T>(timeoutMs, operation)
        ]);

        DebugLogger.debug(` ${operation} completed successfully`);
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof TimeoutError) {
          DebugLogger.debug(`⏰ ${operation} timed out after ${timeoutMs}ms (attempt ${attempt + 1}/${retries + 1})`);

          // Don't retry on timeout for the last attempt
          if (attempt === retries) {
            throw new TimeoutError(`${operation} timed out after ${retries + 1} attempts (${timeoutMs}ms each)`);
          }
        } else {
          DebugLogger.debug(` ${operation} failed: ${lastError.message} (attempt ${attempt + 1}/${retries + 1})`);

          // For non-timeout errors, check if we should retry
          if (!ApiTimeoutHandler.shouldRetry(lastError) || attempt === retries) {
            throw lastError;
          }
        }
      }
    }

    throw lastError || new Error(`${operation} failed after all retry attempts`);
  }

  /**
   * Create a promise that rejects after a timeout
   */
  private static createTimeoutPromise<T>(timeoutMs: number, operation: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new TimeoutError(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Determine if an error should trigger a retry
   */
  private static shouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Don't retry authentication errors
    if (message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('token') ||
        message.includes('auth')) {
      return false;
    }

    // Don't retry validation errors
    if (message.includes('validation_error') ||
        message.includes('invalid_request')) {
      return false;
    }

    // Don't retry not found errors
    if (message.includes('object_not_found') ||
        message.includes('not found')) {
      return false;
    }

    // Retry network errors, server errors, and timeouts
    return message.includes('network') ||
           message.includes('timeout') ||
           message.includes('fetch') ||
           message.includes('econnreset') ||
           message.includes('enotfound') ||
           message.includes('etimedout') ||
           message.includes('500') ||
           message.includes('502') ||
           message.includes('503') ||
           message.includes('504');
  }

  /**
   * Delay execution for a given number of milliseconds
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create multiple concurrent operations with timeout
   */
  static async withConcurrentTimeout<T>(
    operations: (() => Promise<T>)[],
    config: TimeoutConfig
  ): Promise<T[]> {
    const { operation = 'Concurrent API calls' } = config;

    DebugLogger.debug(` Starting ${operations.length} concurrent operations: ${operation}`);

    const promises = operations.map((op, index) =>
      ApiTimeoutHandler.withTimeout(op, {
        ...config,
        operation: `${operation} [${index + 1}]`
      })
    );

    try {
      const results = await Promise.all(promises);
      DebugLogger.debug(` All ${operations.length} concurrent operations completed`);
      return results;
    } catch (error) {
      DebugLogger.debug(` Concurrent operations failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Simple circuit breaker implementation
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly failureThreshold = 3,
    private readonly resetTimeoutMs = 60000, // 1 minute
    private readonly operation = 'API'
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        DebugLogger.debug(`🔄 Circuit breaker for ${this.operation} switching to HALF_OPEN`);
      } else {
        const remainingTime = Math.ceil((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000);
        throw new CircuitBreakerError(`Circuit breaker is OPEN for ${this.operation}. Retry in ${remainingTime}s`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      DebugLogger.debug(` Circuit breaker for ${this.operation} reset to CLOSED`);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      DebugLogger.debug(`🔴 Circuit breaker for ${this.operation} opened due to ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}