import React from "react";
import { Text, Box, useInput } from "ink";

export interface SelectableListItem {
  id: string;
  disabled?: boolean;
}

export interface SelectableListProps<T extends SelectableListItem> {
  items: T[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onSelect?: (item: T, index: number) => void;
  onBack?: () => void;
  renderItem: (item: T, isSelected: boolean, index: number) => React.ReactNode;
  viewportSize?: number;
  scrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  disableInput?: boolean;
  customKeyHandler?: (input: string, key: any) => boolean;
}

export function SelectableList<T extends SelectableListItem>({
  items,
  selectedIndex,
  onSelectedIndexChange,
  onSelect,
  onBack,
  renderItem,
  viewportSize,
  scrollOffset = 0,
  onScrollOffsetChange,
  disableInput = false,
  customKeyHandler,
}: SelectableListProps<T>): React.ReactElement | null {
  useInput(
    (input, key) => {
      if (disableInput) return;

      if (customKeyHandler && customKeyHandler(input, key)) {
        return;
      }

      if (key.upArrow) {
        const newIndex = Math.max(0, selectedIndex - 1);
        onSelectedIndexChange(newIndex);
        if (onScrollOffsetChange && viewportSize && newIndex < scrollOffset) {
          onScrollOffsetChange(newIndex);
        }
      } else if (key.downArrow) {
        const newIndex = Math.min(items.length - 1, selectedIndex + 1);
        onSelectedIndexChange(newIndex);
        if (
          onScrollOffsetChange &&
          viewportSize &&
          newIndex >= scrollOffset + viewportSize
        ) {
          onScrollOffsetChange(newIndex - viewportSize + 1);
        }
      } else if (key.return && onSelect) {
        const item = items[selectedIndex];
        if (item && !item.disabled) {
          onSelect(item, selectedIndex);
        }
      } else if ((input === "b" || key.escape) && onBack) {
        onBack();
      }
    },
    { isActive: !disableInput }
  );

  if (items.length === 0) {
    return null;
  }

  const displayItems = viewportSize
    ? items.slice(scrollOffset, scrollOffset + viewportSize)
    : items;

  const startIndex = viewportSize ? scrollOffset : 0;

  return (
    <Box flexDirection="column">
      {displayItems.map((item, displayIndex) => {
        const actualIndex = startIndex + displayIndex;
        const isSelected = actualIndex === selectedIndex;
        return (
          <Box key={item.id}>{renderItem(item, isSelected, actualIndex)}</Box>
        );
      })}
    </Box>
  );
}

export interface UseSelectableListOptions {
  itemCount: number;
  initialIndex?: number;
  viewportSize?: number;
}

export interface UseSelectableListResult {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  scrollOffset: number;
  setScrollOffset: (offset: number) => void;
  visibleRange: { start: number; end: number };
  isAtTop: boolean;
  isAtBottom: boolean;
}

export function useSelectableList({
  itemCount,
  initialIndex = 0,
  viewportSize,
}: UseSelectableListOptions): UseSelectableListResult {
  const [selectedIndex, setSelectedIndex] = React.useState(initialIndex);
  const [scrollOffset, setScrollOffset] = React.useState(0);

  const effectiveViewportSize = viewportSize || itemCount;
  const visibleEnd = Math.min(scrollOffset + effectiveViewportSize, itemCount);

  return {
    selectedIndex,
    setSelectedIndex,
    scrollOffset,
    setScrollOffset,
    visibleRange: { start: scrollOffset, end: visibleEnd },
    isAtTop: selectedIndex === 0,
    isAtBottom: selectedIndex === itemCount - 1,
  };
}
