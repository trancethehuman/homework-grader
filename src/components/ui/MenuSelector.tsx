import React from "react";
import { Text, Box } from "ink";
import { useMenuSelector, MenuOption } from "../../hooks/useMenuSelector.js";

export interface MenuSelectorProps<T> {
  title: string;
  subtitle?: string;
  options: MenuOption<T>[];
  onSelect: (id: T) => void;
  onBack?: () => void;
  initialIndex?: number;
  highlightColor?: string;
  showBackHint?: boolean;
  showExitHint?: boolean;
}

/**
 * Generic menu selector component with keyboard navigation.
 * Supports up/down arrows, Enter to select, and back navigation.
 */
export function MenuSelector<T>({
  title,
  subtitle,
  options,
  onSelect,
  onBack,
  initialIndex = 0,
  highlightColor = "blue",
  showBackHint = true,
  showExitHint = true,
}: MenuSelectorProps<T>): React.ReactElement {
  const { selectedIndex } = useMenuSelector({
    options,
    onSelect,
    onBack,
    initialIndex,
  });

  return (
    <Box flexDirection="column">
      <Text color={highlightColor} bold>
        {title}
      </Text>
      <Text></Text>
      {subtitle && <Text>{subtitle}</Text>}
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
      <Text></Text>

      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        const isDisabled = option.disabled || option.comingSoon;

        return (
          <Box key={String(option.id)} flexDirection="column" marginBottom={1}>
            <Box>
              <Text
                color={isDisabled ? "gray" : isSelected ? highlightColor : "white"}
                bold={isSelected}
              >
                {isSelected ? "→ " : "  "}
                {option.name}
                {option.comingSoon && " (coming soon)"}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor={!isDisabled} color={isDisabled ? "gray" : undefined}>
                {option.description}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      {showBackHint && onBack && (
        <Text dimColor>Press 'b' or Escape to go back{showExitHint ? ", Ctrl+C to exit" : ""}</Text>
      )}
      {!onBack && showExitHint && <Text dimColor>Press Ctrl+C to exit</Text>}
    </Box>
  );
}

// Re-export types for convenience
export type { MenuOption };
