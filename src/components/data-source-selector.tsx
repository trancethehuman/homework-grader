import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";
import { HelpFooter, createHelpHints } from "./ui/HelpFooter.js";

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

export const DataSourceSelector: React.FC<DataSourceSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  return (
    <MenuSelector
      title="Select Data Source"
      subtitle="Choose where to load GitHub URLs from:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
      footer={<HelpFooter hints={onBack ? createHelpHints("navigate", "select", "backEsc") : createHelpHints("navigate", "select")} />}
    />
  );
};
