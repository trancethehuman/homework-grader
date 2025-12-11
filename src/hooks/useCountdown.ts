import { useState, useEffect, useCallback } from "react";
import { formatCountdown } from "../lib/github/rate-limit-checker.js";

export interface UseCountdownOptions {
  targetTime: Date;
  onComplete?: () => void;
  updateIntervalMs?: number;
}

export interface UseCountdownResult {
  remainingMs: number;
  remainingFormatted: string;
  isComplete: boolean;
}

export function useCountdown({
  targetTime,
  onComplete,
  updateIntervalMs = 1000,
}: UseCountdownOptions): UseCountdownResult {
  const calculateRemaining = useCallback(() => {
    return Math.max(0, targetTime.getTime() - Date.now());
  }, [targetTime]);

  const [remainingMs, setRemainingMs] = useState(calculateRemaining);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isComplete) return;

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingMs(remaining);

      if (remaining <= 0 && !isComplete) {
        setIsComplete(true);
        onComplete?.();
      }
    }, updateIntervalMs);

    return () => clearInterval(interval);
  }, [targetTime, onComplete, updateIntervalMs, isComplete, calculateRemaining]);

  return {
    remainingMs,
    remainingFormatted: formatCountdown(remainingMs),
    isComplete,
  };
}
