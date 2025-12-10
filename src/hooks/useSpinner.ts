import { useState, useEffect } from "react";

const DEFAULT_SPINNER_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];
const DEFAULT_INTERVAL_MS = 100;

export interface UseSpinnerOptions {
  frames?: string[];
  intervalMs?: number;
  active?: boolean;
}

/**
 * Hook for displaying animated spinner characters.
 * Returns the current frame of the spinner animation.
 */
export function useSpinner({
  frames = DEFAULT_SPINNER_FRAMES,
  intervalMs = DEFAULT_INTERVAL_MS,
  active = true,
}: UseSpinnerOptions = {}): string {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [frames.length, intervalMs, active]);

  return frames[frameIndex];
}

/**
 * Predefined spinner styles for common use cases.
 */
export const SpinnerFrames = {
  dots: DEFAULT_SPINNER_FRAMES,
  line: ["-", "\\", "|", "/"],
  arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  bounce: ["⠁", "⠂", "⠄", "⠂"],
  clock: ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"],
} as const;
