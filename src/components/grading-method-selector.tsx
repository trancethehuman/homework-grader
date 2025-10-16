import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type GradingMethod = "codex-local" | "sandbox-llm";

interface GradingMethodSelectorProps {
  onSelect: (method: GradingMethod) => void;
  onBack: () => void;
}

export const GradingMethodSelector: React.FC<GradingMethodSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: {
    id: GradingMethod;
    name: string;
    description: string;
    comingSoon?: boolean;
  }[] = [
    {
      id: "codex-local",
      name: "Homeworks are cloned locally and graded by Codex (recommended)",
      description: "Clone repositories locally and grade with Codex",
      comingSoon: false,
    },
    {
      id: "sandbox-llm",
      name: "Homeworks cloned to sandbox and graded by LLMs",
      description: "Clone repositories to E2B sandbox and grade with AI models",
      comingSoon: false,
    },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      const selectedOption = options[selectedIndex];
      if (!selectedOption.comingSoon) {
        onSelect(selectedOption.id);
      }
    } else if (input === "b" || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Grading Method
      </Text>
      <Text></Text>
      <Text>Choose how to grade the repositories:</Text>
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
      <Text></Text>

      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        const isDisabled = option.comingSoon;
        return (
          <Box key={option.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text
                color={isDisabled ? "gray" : isSelected ? "blue" : "white"}
                bold={isSelected}
              >
                {isSelected ? "→ " : "  "}
                {option.name}
                {isDisabled && " (coming soon)"}
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
      <Text dimColor>Press 'b' or Escape to go back, Ctrl+C to exit</Text>
    </Box>
  );
};
