import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { CSVAnalysis } from "../../lib/csv-utils.js";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";

interface CollaboratorCsvColumnSelectorProps {
  analysis: CSVAnalysis;
  onSelect: (usernames: string[]) => void;
  onBack: () => void;
  targetRepo: string;
}

export const CollaboratorCsvColumnSelector: React.FC<CollaboratorCsvColumnSelectorProps> = ({
  analysis,
  onSelect,
  onBack,
  targetRepo,
}) => {
  const [selectedColumn, setSelectedColumn] = useState(0);

  const extractUsernames = (columnName: string): string[] => {
    const column = analysis.columns.find((c) => c.name === columnName);
    if (!column) return [];

    const usernames = new Set<string>();
    for (const value of column.sampleValues) {
      const trimmed = value.trim();
      if (trimmed && !trimmed.includes(" ")) {
        usernames.add(trimmed);
      }
    }
    return Array.from(usernames);
  };

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedColumn((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedColumn((prev) => Math.min(analysis.columns.length - 1, prev + 1));
    } else if (key.return) {
      const column = analysis.columns[selectedColumn];
      const usernames = extractUsernames(column.name);
      if (usernames.length > 0) {
        onSelect(usernames);
      }
    } else if (input === "b" || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Username Column
      </Text>
      <Text dimColor>Adding collaborators to: {targetRepo}</Text>
      <Text></Text>
      <Text>File: {analysis.filePath}</Text>
      <Text>Total rows: {analysis.totalRows}</Text>
      <Text></Text>
      <Text color="green" bold>
        Select column containing GitHub usernames:
      </Text>
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
      <Text></Text>

      {analysis.columns.map((column, index) => {
        const isSelected = index === selectedColumn;

        return (
          <Box key={index} flexDirection="column" marginBottom={0}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {index + 1}. {column.name}
              </Text>
            </Box>
            {column.sampleValues.length > 0 && (
              <Box marginLeft={4}>
                <Text dimColor>
                  Sample: {column.sampleValues.slice(0, 5).join(", ")}
                  {column.sampleValues.length > 5 && "..."}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Text></Text>
      <HelpFooter hints={createHelpHints("navigate", "select", "back")} />
    </Box>
  );
};
