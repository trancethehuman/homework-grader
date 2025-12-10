import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type WorkflowMode = "codex" | "llm";

interface WorkflowModeSelectorProps {
  onSelect: (mode: WorkflowMode) => void;
  onBack: () => void;
}

const options: MenuOption<WorkflowMode>[] = [
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

export const WorkflowModeSelector: React.FC<WorkflowModeSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  return (
    <MenuSelector
      title="Select Workflow Mode"
      subtitle="Choose your workflow:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
