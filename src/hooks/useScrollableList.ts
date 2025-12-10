import { useState, useCallback } from "react";

export interface UseScrollableListOptions {
  itemCount: number;
  viewportSize: number;
  initialIndex?: number;
}

export interface UseScrollableListResult {
  selectedIndex: number;
  scrollOffset: number;
  setSelectedIndex: (index: number) => void;
  scrollUp: () => void;
  scrollDown: () => void;
  scrollToIndex: (index: number) => void;
  visibleRange: { start: number; end: number };
  isAtTop: boolean;
  isAtBottom: boolean;
}

/**
 * Hook for managing scrollable list navigation with a viewport.
 * Handles automatic scroll adjustment when selection moves outside viewport.
 */
export function useScrollableList({
  itemCount,
  viewportSize,
  initialIndex = 0,
}: UseScrollableListOptions): UseScrollableListResult {
  const [selectedIndex, setSelectedIndexState] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);

  const scrollToIndex = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(itemCount - 1, index));
      setSelectedIndexState(clampedIndex);

      // Adjust scroll offset to keep selection in view
      if (clampedIndex < scrollOffset) {
        setScrollOffset(clampedIndex);
      } else if (clampedIndex >= scrollOffset + viewportSize) {
        setScrollOffset(clampedIndex - viewportSize + 1);
      }
    },
    [itemCount, viewportSize, scrollOffset]
  );

  const scrollUp = useCallback(() => {
    setSelectedIndexState((prev) => {
      const newIndex = Math.max(0, prev - 1);
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      }
      return newIndex;
    });
  }, [scrollOffset]);

  const scrollDown = useCallback(() => {
    setSelectedIndexState((prev) => {
      const newIndex = Math.min(itemCount - 1, prev + 1);
      if (newIndex >= scrollOffset + viewportSize) {
        setScrollOffset(newIndex - viewportSize + 1);
      }
      return newIndex;
    });
  }, [itemCount, viewportSize, scrollOffset]);

  const setSelectedIndex = useCallback(
    (index: number) => {
      scrollToIndex(index);
    },
    [scrollToIndex]
  );

  const visibleRange = {
    start: scrollOffset,
    end: Math.min(scrollOffset + viewportSize, itemCount),
  };

  return {
    selectedIndex,
    scrollOffset,
    setSelectedIndex,
    scrollUp,
    scrollDown,
    scrollToIndex,
    visibleRange,
    isAtTop: selectedIndex === 0,
    isAtBottom: selectedIndex === itemCount - 1,
  };
}
