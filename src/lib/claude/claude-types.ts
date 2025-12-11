import type {
  AgentConfig,
  AgentEventHandler,
  GradingResult,
  GradingStructuredOutput,
} from "../agents/types.js";

export interface ClaudeAgentConfig extends AgentConfig {
  model: string;
}

export interface ClaudeAgentEventHandler extends AgentEventHandler {
  onToolStart?: (toolName: string, toolInput: unknown) => void;
  onToolComplete?: (toolName: string, toolOutput: unknown) => void;
  onToolError?: (toolName: string, error: string) => void;
}

export interface ClaudeGradingResult extends GradingResult {
  sessionId?: string;
  costUsd?: number;
  durationMs?: number;
}

export {
  AgentConfig,
  AgentEventHandler,
  GradingResult,
  GradingStructuredOutput,
};
