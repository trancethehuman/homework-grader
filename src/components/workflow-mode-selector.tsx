import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type WorkflowMode = "codex" | "llm";

interface WorkflowModeSelectorProps {
  onSelect: (mode: WorkflowMode) => void;
  onBack: () => void;
}

export const WorkflowModeSelector: React.FC<WorkflowModeSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { id: WorkflowMode; name: string; description: string }[] = [
    {
      id: "codex",
      name: "Codex",
      description: "Access Codex features: run tests or choose database",
    },
    {
      id: "llm",
      name: "LLM",
      description: "Select an AI model for grading homework submissions",
    },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(options.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(options[selectedIndex].id);
    } else if (input === "b" || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Workflow Mode
      </Text>
      <Text></Text>
      <Text>Choose your workflow:</Text>
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
      <Text dimColor>Press 'b' or Escape to go back, Ctrl+C to exit</Text>
    </Box>
  );
};
