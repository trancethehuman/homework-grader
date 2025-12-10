import { AIProvider } from "../consts/ai-providers.js";

interface TokenUsageRecord {
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
}

export class RateLimiter {
  private provider: AIProvider;
  private usageRecords: TokenUsageRecord[] = [];
  private requestTimestamps: number[] = [];
  private readonly windowMs = 60000;
  private readonly defaultMargin = 0.1;

  constructor(provider: AIProvider) {
    this.provider = provider;
  }

  private getMargin(): number {
    return this.provider.rateLimitMargin ?? this.defaultMargin;
  }

  parseRetryAfter(error: Error): number | null {
    const errorMessage = error.message;

    const patterns = [
      /retry in ([\d.]+)s/i,
      /retry after ([\d.]+) seconds?/i,
      /wait ([\d.]+)s/i,
      /Please retry in ([\d.]+)s/i,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match && match[1]) {
        const seconds = parseFloat(match[1]);
        return Math.ceil(seconds * 1000);
      }
    }

    return null;
  }

  recordRateLimitHit(waitTimeMs: number): void {
    const now = Date.now();
    const effectiveTpm = this.provider.rateLimitTpm ||
                        (this.provider.rateLimitInputTpm || 0) + (this.provider.rateLimitOutputTpm || 0);

    if (effectiveTpm > 0) {
      const largeTokenUsage = Math.floor(effectiveTpm * 0.5);
      this.usageRecords.push({
        timestamp: now,
        inputTokens: largeTokenUsage,
        outputTokens: 0,
      });
    }

    console.log(` Rate limit hit recorded, forcing cooldown period`);
  }

  recordTokenUsage(inputTokens: number, outputTokens: number): void {
    const now = Date.now();
    this.usageRecords.push({
      timestamp: now,
      inputTokens,
      outputTokens,
    });
    this.requestTimestamps.push(now);
    this.pruneOldUsage(now);
  }

  private pruneOldUsage(now: number): void {
    const cutoff = now - this.windowMs;
    this.usageRecords = this.usageRecords.filter((r) => r.timestamp > cutoff);
    this.requestTimestamps = this.requestTimestamps.filter(
      (t) => t > cutoff
    );
  }

  checkRateLimit(
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const now = Date.now();
    this.pruneOldUsage(now);

    const rpmWait = this.checkRpmLimit();
    const tpmWait = this.checkTpmLimit(
      estimatedInputTokens,
      estimatedOutputTokens
    );

    return Math.max(rpmWait, tpmWait);
  }

  private checkRpmLimit(): number {
    if (!this.provider.rateLimitRpm) {
      return 0;
    }

    const margin = this.getMargin();
    const effectiveLimit = Math.floor(this.provider.rateLimitRpm * (1 - margin));
    const requestsInWindow = this.requestTimestamps.length;

    if (requestsInWindow < effectiveLimit) {
      return 0;
    }

    if (requestsInWindow >= effectiveLimit * 0.9) {
      console.log(` Approaching RPM limit (${requestsInWindow}/${this.provider.rateLimitRpm})`);
    }

    const oldestRequest = this.requestTimestamps[0];
    const waitTime = this.windowMs - (Date.now() - oldestRequest);
    return Math.max(0, waitTime);
  }

  private checkTpmLimit(
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const hasInputOutputLimits =
      this.provider.rateLimitInputTpm !== undefined &&
      this.provider.rateLimitOutputTpm !== undefined;

    if (hasInputOutputLimits) {
      return this.checkSeparateInputOutputLimits(
        estimatedInputTokens,
        estimatedOutputTokens
      );
    }

    if (!this.provider.rateLimitTpm) {
      return 0;
    }

    const margin = this.getMargin();
    const effectiveLimit = Math.floor(this.provider.rateLimitTpm * (1 - margin));

    const totalTokensInWindow = this.usageRecords.reduce(
      (sum, r) => sum + r.inputTokens + r.outputTokens,
      0
    );

    const estimatedTotal = estimatedInputTokens + estimatedOutputTokens;
    const projectedTotal = totalTokensInWindow + estimatedTotal;

    if (projectedTotal >= effectiveLimit * 0.9 && projectedTotal < effectiveLimit) {
      console.log(` Approaching TPM limit (${Math.floor(totalTokensInWindow / 1000)}K/${Math.floor(this.provider.rateLimitTpm / 1000)}K)`);
    }

    if (projectedTotal <= effectiveLimit) {
      return 0;
    }

    const oldestUsage = this.usageRecords[0];
    if (!oldestUsage) {
      return 0;
    }

    const waitTime = this.windowMs - (Date.now() - oldestUsage.timestamp);
    return Math.max(0, waitTime);
  }

  private checkSeparateInputOutputLimits(
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const margin = this.getMargin();
    const inputTokensInWindow = this.usageRecords.reduce(
      (sum, r) => sum + r.inputTokens,
      0
    );
    const outputTokensInWindow = this.usageRecords.reduce(
      (sum, r) => sum + r.outputTokens,
      0
    );

    let inputWait = 0;
    if (this.provider.rateLimitInputTpm) {
      const effectiveInputLimit = Math.floor(this.provider.rateLimitInputTpm * (1 - margin));
      const projectedInput = inputTokensInWindow + estimatedInputTokens;

      if (projectedInput >= effectiveInputLimit * 0.9 && projectedInput < effectiveInputLimit) {
        console.log(` Approaching Input TPM limit (${Math.floor(inputTokensInWindow / 1000)}K/${Math.floor(this.provider.rateLimitInputTpm / 1000)}K)`);
      }

      if (projectedInput > effectiveInputLimit) {
        const oldestUsage = this.usageRecords[0];
        if (oldestUsage) {
          inputWait = this.windowMs - (Date.now() - oldestUsage.timestamp);
        }
      }
    }

    let outputWait = 0;
    if (this.provider.rateLimitOutputTpm) {
      const effectiveOutputLimit = Math.floor(this.provider.rateLimitOutputTpm * (1 - margin));
      const projectedOutput = outputTokensInWindow + estimatedOutputTokens;

      if (projectedOutput >= effectiveOutputLimit * 0.9 && projectedOutput < effectiveOutputLimit) {
        console.log(` Approaching Output TPM limit (${Math.floor(outputTokensInWindow / 1000)}K/${Math.floor(this.provider.rateLimitOutputTpm / 1000)}K)`);
      }

      if (projectedOutput > effectiveOutputLimit) {
        const oldestUsage = this.usageRecords[0];
        if (oldestUsage) {
          outputWait = this.windowMs - (Date.now() - oldestUsage.timestamp);
        }
      }
    }

    return Math.max(0, inputWait, outputWait);
  }

  getWaitTime(): number {
    return this.checkRateLimit(0, 0);
  }

  getRateLimitStatus(): {
    requestsUsed: number;
    requestsLimit: number | undefined;
    inputTokensUsed: number;
    outputTokensUsed: number;
    totalTokensUsed: number;
    inputTokenLimit: number | undefined;
    outputTokenLimit: number | undefined;
    totalTokenLimit: number | undefined;
  } {
    const now = Date.now();
    this.pruneOldUsage(now);

    const inputTokensUsed = this.usageRecords.reduce(
      (sum, r) => sum + r.inputTokens,
      0
    );
    const outputTokensUsed = this.usageRecords.reduce(
      (sum, r) => sum + r.outputTokens,
      0
    );

    return {
      requestsUsed: this.requestTimestamps.length,
      requestsLimit: this.provider.rateLimitRpm,
      inputTokensUsed,
      outputTokensUsed,
      totalTokensUsed: inputTokensUsed + outputTokensUsed,
      inputTokenLimit: this.provider.rateLimitInputTpm,
      outputTokenLimit: this.provider.rateLimitOutputTpm,
      totalTokenLimit: this.provider.rateLimitTpm,
    };
  }
}
