import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type GradingMode = "local" | "batch" | "collaborator";

interface GradingModeSelectorProps {
  onSelect: (mode: GradingMode) => void;
}

const options: MenuOption<GradingMode>[] = [
  {
    id: "local",
    name: "Repo on my machine",
    description: "Grade a single repository on your local machine",
  },
  {
    id: "batch",
    name: "Remote repo(s)",
    description: "Grade multiple repositories from CSV, Notion, or manual input",
  },
  {
    id: "collaborator",
    name: "Bulk add GitHub users to a repo",
    description: "Add multiple users as read-only collaborators to a repository",
  },
];

export const GradingModeSelector: React.FC<GradingModeSelectorProps> = ({
  onSelect,
}) => {
  return (
    <MenuSelector
      title="Welcome to Homework Grader"
      subtitle="Choose how you want to grade:"
      options={options}
      onSelect={onSelect}
      showBackHint={false}
    />
  );
};
