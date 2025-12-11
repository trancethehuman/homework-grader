import React from "react";
import { MenuSelector, MenuOption } from "./ui/MenuSelector.js";
import { getModelsForAgent, type AgentType, type AgentModelInfo } from "../lib/agents/index.js";

interface AgentModelSelectorProps {
  agentType: AgentType;
  onSelect: (modelId: string) => void;
  onBack: () => void;
}

export const AgentModelSelector: React.FC<AgentModelSelectorProps> = ({
  agentType,
  onSelect,
  onBack,
}) => {
  const models = getModelsForAgent(agentType);

  const options: MenuOption<string>[] = models.map((model: AgentModelInfo) => ({
    id: model.id,
    name: model.name,
    description: model.description || "",
  }));

  const agentName = agentType === "codex" ? "Codex" : "Claude Agent";

  return (
    <MenuSelector
      title={`Select ${agentName} Model`}
      subtitle="Choose which model to use for grading:"
      options={options}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
};
