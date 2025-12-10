import React from "react";
import { MenuSelector, MenuOption } from "../ui/MenuSelector.js";

export type CollaboratorDataSource = "csv" | "notion" | "manual";

interface CollaboratorDataSourceSelectorProps {
  onSelect: (source: CollaboratorDataSource) => void;
  onBack?: () => void;
  targetRepo: string;
}

const options: MenuOption<CollaboratorDataSource>[] = [
  {
    id: "manual",
    name: "Manual Input",
    description: "Enter comma-separated GitHub usernames directly",
  },
  {
    id: "csv",
    name: "CSV File",
    description: "Load GitHub usernames from a CSV file column",
  },
  {
    id: "notion",
    name: "Notion Database",
    description: "Load GitHub usernames from a Notion database column",
  },
];

export const CollaboratorDataSourceSelector: React.FC<CollaboratorDataSourceSelectorProps> = ({
  onSelect,
  onBack,
  targetRepo,
}) => {
  return (
    <MenuSelector
      title={`Add Collaborators to ${targetRepo}`}
      subtitle="Where should we get the GitHub usernames from?"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
