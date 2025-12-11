import type { AgentModelInfo, AgentType } from "./types.js";

export const CLAUDE_AGENT_MODELS: AgentModelInfo[] = [
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    description: "Smart model for complex agents and coding",
  },
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    description: "Premium model with maximum intelligence",
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    description: "Fastest model with near-frontier intelligence",
  },
];

export const CODEX_MODELS: AgentModelInfo[] = [
  {
    id: "gpt-5.1-codex-max",
    name: "GPT-5.1 Codex Max",
    description: "Optimized for long-horizon, agentic coding tasks",
  },
  {
    id: "gpt-5.1-codex-mini",
    name: "GPT-5.1 Codex Mini",
    description: "Smaller, more cost-effective version",
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    description: "Great for coding and agentic tasks",
  },
];

export function getModelsForAgent(agentType: AgentType): AgentModelInfo[] {
  switch (agentType) {
    case "claude-agent":
      return CLAUDE_AGENT_MODELS;
    case "codex":
      return CODEX_MODELS;
    default:
      return [];
  }
}

export function getDefaultModelForAgent(agentType: AgentType): string {
  switch (agentType) {
    case "claude-agent":
      return CLAUDE_AGENT_MODELS[0].id;
    case "codex":
      return CODEX_MODELS[0].id;
    default:
      return "";
  }
}
