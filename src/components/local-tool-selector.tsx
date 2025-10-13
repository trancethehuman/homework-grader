import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type LocalTool = "codex" | "claude-code" | "cursor";

interface LocalToolSelectorProps {
  onSelect: (tool: LocalTool) => void;
  onBack: () => void;
}

export const LocalToolSelector: React.FC<LocalToolSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: {
    id: LocalTool;
    name: string;
    description: string;
    comingSoon?: boolean;
  }[] = [
    {
      id: "codex",
      name: "Codex",
      description: "Use Codex for local repository grading",
      comingSoon: false,
    },
    {
      id: "claude-code",
      name: "Claude Code",
      description: "Use Claude Code for local repository grading",
      comingSoon: true,
    },
    {
      id: "cursor",
      name: "Cursor CLI",
      description: "Use Cursor CLI for local repository grading",
      comingSoon: true,
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
        Select Local Grading Tool
      </Text>
      <Text></Text>
      <Text>Choose which tool to use for local grading:</Text>
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
