export interface RateLimitCheckResult {
  sufficient: boolean;
  remaining: number;
  needed: number;
  limit: number;
  resetAt: Date;
  resetInSeconds: number;
  shortfall: number;
}

export interface RateLimitInfo {
  remaining: number;
  reset: number;
  used: number;
  limit: number;
}

const DEFAULT_SAFETY_MARGIN_PERCENT = 0.1;

export function checkBulkOperationQuota(
  rateLimit: RateLimitInfo,
  operationCount: number,
  safetyMarginPercent: number = DEFAULT_SAFETY_MARGIN_PERCENT
): RateLimitCheckResult {
  const safetyMargin = Math.ceil(operationCount * safetyMarginPercent);
  const needed = operationCount + safetyMargin;
  const resetAt = new Date(rateLimit.reset * 1000);
  const resetInSeconds = Math.max(
    0,
    Math.floor((resetAt.getTime() - Date.now()) / 1000)
  );

  return {
    sufficient: rateLimit.remaining >= needed,
    remaining: rateLimit.remaining,
    needed,
    limit: rateLimit.limit,
    resetAt,
    resetInSeconds,
    shortfall: Math.max(0, needed - rateLimit.remaining),
  };
}

export function formatResetTime(resetAt: Date): string {
  const now = Date.now();
  const resetTime = resetAt.getTime();
  const diffMs = resetTime - now;

  if (diffMs <= 0) {
    return "now";
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  const timeString = resetAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffHours >= 1) {
    const remainingMinutes = diffMinutes % 60;
    if (remainingMinutes > 0) {
      return `at ${timeString} (in ${diffHours}h ${remainingMinutes}m)`;
    }
    return `at ${timeString} (in ${diffHours}h)`;
  }

  if (diffMinutes >= 1) {
    return `at ${timeString} (in ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"})`;
  }

  return `at ${timeString} (in ${diffSeconds} second${diffSeconds === 1 ? "" : "s"})`;
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function getWaitTimeMs(resetAt: Date): number {
  return Math.max(0, resetAt.getTime() - Date.now());
}
