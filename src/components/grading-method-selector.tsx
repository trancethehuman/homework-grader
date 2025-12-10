import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";

export type GradingMethod = "codex-local" | "sandbox-llm";

interface GradingMethodSelectorProps {
  onSelect: (method: GradingMethod) => void;
  onBack: () => void;
}

const options: MenuOption<GradingMethod>[] = [
  {
    id: "codex-local",
    name: "Homeworks are cloned locally and graded by Codex (recommended)",
    description: "Clone repositories locally and grade with Codex",
  },
  {
    id: "sandbox-llm",
    name: "Homeworks cloned to sandbox and graded by LLMs",
    description: "Clone repositories to E2B sandbox and grade with AI models",
  },
];

export const GradingMethodSelector: React.FC<GradingMethodSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  return (
    <MenuSelector
      title="Select Grading Method"
      subtitle="Choose how to grade the repositories:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
