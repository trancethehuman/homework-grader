import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type DataSource = "csv" | "notion" | "manual";

interface DataSourceSelectorProps {
  onSelect: (source: DataSource) => void;
  onBack?: () => void;
}

const options: MenuOption<DataSource>[] = [
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
  {
    id: "manual",
    name: "Manual Input",
    description: "Enter comma-separated GitHub URLs directly",
  },
];

interface BackFooterProps {
  isFocused: boolean;
}

const BackFooter: React.FC<BackFooterProps> = ({ isFocused }) => {
  return (
    <Box>
      <Text color={isFocused ? "blue" : "gray"} bold={isFocused}>
        back
      </Text>
    </Box>
  );
};

export const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [isFooterFocused, setIsFooterFocused] = useState(false);

  useInput((_input, key) => {
    if (isFooterFocused) {
      if (key.upArrow) {
        setIsFooterFocused(false);
      } else if (key.return && onBack) {
        onBack();
      }
    }
  });

  const handleSelect = (source: DataSource) => {
    if (!isFooterFocused) {
      onSelect(source);
    }
  };

  const handleNavigateEnd = () => {
    if (onBack) {
      setIsFooterFocused(true);
    }
  };

  return (
    <MenuSelector
      title="Select Data Source"
      subtitle="Choose where to load GitHub URLs from:"
      options={options}
      onSelect={handleSelect}
      onBack={onBack}
      footer={onBack ? <BackFooter isFocused={isFooterFocused} /> : undefined}
      onNavigateEnd={handleNavigateEnd}
      disableHighlight={isFooterFocused}
    />
  );
};
