import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";
import { HelpFooter, createHelpHints } from "./ui/HelpFooter.js";

export type GradingMethod = "codex-local" | "claude-agent" | "sandbox-llm";

interface GradingMethodSelectorProps {
  onSelect: (method: GradingMethod) => void;
  onBack: () => void;
}

const options: MenuOption<GradingMethod>[] = [
  {
    id: "codex-local",
    name: "Codex (OpenAI)",
    description: "Clone repositories locally and grade with OpenAI Codex",
  },
  {
    id: "claude-agent",
    name: "Claude Agent (Anthropic)",
    description: "Clone repositories locally and grade with Claude Agent SDK",
  },
  {
    id: "sandbox-llm",
    name: "Sandbox LLM",
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
      footer={<HelpFooter hints={createHelpHints("navigate", "select", "backEsc")} />}
    />
  );
};
