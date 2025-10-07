import { loadPromptFromFile } from "../prompts/prompt-loader.js";

export interface GradingPrompt {
  name: string;
  value: string;
  description: string;
}

export const BUILD_YOUR_FIRST_AGENT_PROMPT = loadPromptFromFile(
  "build-your-first-agent.ts"
);

export const MCP_CLIENT_PROMPT = loadPromptFromFile(
  "mcp-client-implementation.ts"
);

export const GRADING_PROMPTS: GradingPrompt[] = [
  {
    name: "BUILD YOUR FIRST AGENT PROMPT",
    value: BUILD_YOUR_FIRST_AGENT_PROMPT,
    description:
      "Comprehensive code review focusing on technical decisions, critical improvements, and optional enhancements. Designed for agent development projects with modern AI model awareness.",
  },
  {
    name: "MCP CLIENT IMPLEMENTATION",
    value: MCP_CLIENT_PROMPT,
    description:
      "Specialized evaluation for MCP client implementations with AI SDK. Checks SSE transport setup, client lifecycle, tool integration, error handling, and common pitfalls like premature disconnection or strict typing issues.",
  },
];

export function getGradingPrompts(): GradingPrompt[] {
  return GRADING_PROMPTS;
}

export function getGradingPromptByName(
  name: string
): GradingPrompt | undefined {
  return GRADING_PROMPTS.find((prompt) => prompt.name === name);
}

export function getDefaultGradingPrompt(): GradingPrompt {
  return GRADING_PROMPTS[0]; // BUILD YOUR FIRST AGENT PROMPT is default
}
