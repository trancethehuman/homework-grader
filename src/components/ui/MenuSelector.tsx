import React from "react";
import { Text, Box } from "ink";
import { useMenuSelector, MenuOption } from "../../hooks/useMenuSelector.js";

export interface MenuCategory {
  id: string;
  name: string;
  icon: string;
}

export interface MenuSelectorProps<T> {
  title: string;
  subtitle?: string;
  options: MenuOption<T>[];
  onSelect: (id: T) => void;
  onBack?: () => void;
  initialIndex?: number;
  highlightColor?: string;
  categories?: MenuCategory[];
  customHeader?: React.ReactNode;
  footer?: React.ReactNode;
  onNavigateEnd?: () => void;
  disableHighlight?: boolean;
}

export function MenuSelector<T>({
  title,
  subtitle,
  options,
  onSelect,
  onBack,
  initialIndex = 0,
  highlightColor = "blue",
  categories,
  customHeader,
  footer,
  onNavigateEnd,
  disableHighlight = false,
}: MenuSelectorProps<T>): React.ReactElement {
  const { selectedIndex } = useMenuSelector({
    options,
    onSelect,
    onBack,
    initialIndex,
    onNavigateEnd,
    disabled: disableHighlight,
  });

  const renderCategorizedOptions = () => {
    if (!categories) {
      return options.map((option, index) => renderOption(option, index));
    }

    const rendered: React.ReactNode[] = [];
    let currentCategory: string | undefined;

    options.forEach((option, index) => {
      if (option.category !== currentCategory) {
        currentCategory = option.category;
        const category = categories.find(c => c.id === currentCategory);
        if (category) {
          const isCategoryComing = options
            .filter(o => o.category === category.id)
            .every(o => o.comingSoon);

          rendered.push(
            <Box key={`category-${category.id}`} flexDirection="column" marginTop={index > 0 ? 1 : 0}>
              <Text color="cyan" bold>
                {category.icon} {category.name}{isCategoryComing ? " (coming soon)" : ""}
              </Text>
              <Text color="gray">{"─".repeat(60)}</Text>
            </Box>
          );
        }
      }
      rendered.push(renderOption(option, index));
    });

    return rendered;
  };

  const renderOption = (option: MenuOption<T>, index: number) => {
    const isSelected = index === selectedIndex && !disableHighlight;
    const isDisabled = option.disabled || option.comingSoon;

    return (
      <Box key={String(option.id)} flexDirection="column" marginBottom={1}>
        <Box>
          <Text color={isDisabled ? "gray" : isSelected ? highlightColor : "white"}>
            {isSelected ? "→ " : "  "}
          </Text>
          <Text
            color={isDisabled ? "gray" : isSelected ? highlightColor : "white"}
            bold={isSelected}
          >
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
  };

  return (
    <Box flexDirection="column">
      {customHeader ? (
        customHeader
      ) : (
        <>
          <Text color={highlightColor} bold>
            {title}
          </Text>
          <Text></Text>
          {subtitle && <Text>{subtitle}</Text>}
          <Text></Text>
        </>
      )}

      {renderCategorizedOptions()}

      {footer && (
        <Box justifyContent="flex-end" marginTop={1}>
          {footer}
        </Box>
      )}
    </Box>
  );
}

// Re-export types for convenience
export type { MenuOption };
