import { useState, useCallback } from "react";
import { useInput } from "ink";

export interface MenuOption<T> {
  id: T;
  name: string;
  description: string;
  disabled?: boolean;
  comingSoon?: boolean;
}

export interface UseMenuSelectorOptions<T> {
  options: MenuOption<T>[];
  onSelect: (id: T) => void;
  onBack?: () => void;
  initialIndex?: number;
}

export interface UseMenuSelectorResult {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
}

/**
 * Hook for managing menu selection with keyboard navigation.
 * Handles up/down arrows, Enter to select, and back navigation.
 */
export function useMenuSelector<T>({
  options,
  onSelect,
  onBack,
  initialIndex = 0,
}: UseMenuSelectorOptions<T>): UseMenuSelectorResult {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  const handleSelect = useCallback(() => {
    const selectedOption = options[selectedIndex];
    if (selectedOption && !selectedOption.disabled && !selectedOption.comingSoon) {
      onSelect(selectedOption.id);
    }
  }, [options, selectedIndex, onSelect]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      handleSelect();
    } else if ((input === "b" || key.escape) && onBack) {
      onBack();
    }
  });

  return {
    selectedIndex,
    setSelectedIndex,
  };
}
