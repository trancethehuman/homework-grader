import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export type DataSource = "csv" | "notion";

interface DataSourceSelectorProps {
  onSelect: (source: DataSource) => void;
}

export const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({
  onSelect,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { id: DataSource; name: string; description: string }[] = [
    {
      id: "notion",
      name: "Notion Database",
      description: "Load GitHub URLs from a Notion database",
    },
    {
      id: "csv",
      name: "CSV File",
      description: "Load GitHub URLs from a CSV file",
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
        Select Data Source
      </Text>
      <Text></Text>
      <Text>Choose where to load GitHub URLs from:</Text>
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
      <Text dimColor>Press Enter to select, Ctrl+C to exit</Text>
    </Box>
  );
};