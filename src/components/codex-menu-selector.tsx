import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type CodexMenuOption = "run-test" | "choose-database";

interface CodexMenuSelectorProps {
  onSelect: (option: CodexMenuOption) => void;
  onBack: () => void;
}

const options: MenuOption<CodexMenuOption>[] = [
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

export const CodexMenuSelector: React.FC<CodexMenuSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  return (
    <MenuSelector
      title="Codex Menu"
      subtitle="Choose an option:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
