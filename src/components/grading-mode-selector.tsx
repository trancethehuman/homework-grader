import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type GradingMode = "local" | "batch" | "parallel-test";

interface GradingModeSelectorProps {
  onSelect: (mode: GradingMode) => void;
}

export const GradingModeSelector: React.FC<GradingModeSelectorProps> = ({
  onSelect,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { id: GradingMode; name: string; description: string }[] = [
    {
      id: "local",
      name: "Repo on my machine",
      description: "Grade a single repository on your local machine",
    },
    {
      id: "batch",
      name: "Remote repo(s)",
      description:
        "Grade multiple repositories from CSV, Notion, or manual input",
    },
    {
      id: "parallel-test",
      name: "Test parallel Codex instances (TEMP)",
      description: "Clone and grade 4 test repos in parallel using Codex",
    },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(options[selectedIndex].id);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Welcome to Homework Grader
      </Text>
      <Text></Text>
      <Text>Choose how you want to grade:</Text>
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
      <Text></Text>

      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={option.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {option.name}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>{option.description}</Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
