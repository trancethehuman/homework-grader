import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type CodexMenuOption = "run-test" | "choose-database";

interface CodexMenuSelectorProps {
  onSelect: (option: CodexMenuOption) => void;
  onBack: () => void;
}

export const CodexMenuSelector: React.FC<CodexMenuSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { id: CodexMenuOption; name: string; description: string }[] = [
    {
      id: "run-test",
      name: "Run test",
      description: "Execute Codex test functionality",
    },
    {
      id: "choose-database",
      name: "Choose database",
      description: "Select Notion or CSV data source",
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
        Codex Menu
      </Text>
      <Text></Text>
      <Text>Choose an option:</Text>
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
