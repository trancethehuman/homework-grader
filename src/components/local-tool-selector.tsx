import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type LocalTool = "codex" | "claude-code" | "cursor";

interface LocalToolSelectorProps {
  onSelect: (tool: LocalTool) => void;
  onBack: () => void;
}

const options: MenuOption<LocalTool>[] = [
  {
    id: "codex",
    name: "Codex",
    description: "Use Codex for local repository grading",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    description: "Use Claude Code for local repository grading",
    comingSoon: true,
  },
  {
    id: "cursor",
    name: "Cursor CLI",
    description: "Use Cursor CLI for local repository grading",
    comingSoon: true,
  },
];

export const LocalToolSelector: React.FC<LocalToolSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  return (
    <MenuSelector
      title="Select Local Grading Tool"
      subtitle="Choose which tool to use for local grading:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
