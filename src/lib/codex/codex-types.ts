import type {
  ThreadEvent,
  ThreadItem,
  AgentMessageItem,
  CodexOptions,
  ThreadOptions,
  Usage,
} from "@openai/codex-sdk";

export interface CodexConfig {
  repoPath: string;
  skipGitRepoCheck?: boolean;
  codexOptions?: CodexOptions;
}

export interface CodexThreadConfig {
  workingDirectory: string;
  skipGitRepoCheck: boolean;
  model?: string;
}

export interface CodexGradingResult {
  success: boolean;
  feedback?: string;
  grade?: number;
  error?: string;
  tokensUsed?: {
    input: number;
    cached: number;
    output: number;
    total: number;
  };
}

export interface CodexEventHandler {
  onItemUpdated?: (item: ThreadItem) => void;
  onItemCompleted?: (item: ThreadItem) => void;
  onTurnCompleted?: (usage: Usage) => void;
  onError?: (error: Error) => void;
}

export { ThreadEvent, ThreadItem, AgentMessageItem, CodexOptions, ThreadOptions, Usage };
