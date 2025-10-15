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

export interface ClonedTestRepo {
  url: string;
  owner: string;
  repo: string;
  localPath: string;
}

export interface ParallelGradingResult extends CodexGradingResult {
  repoInfo: {
    url: string;
    owner: string;
    repo: string;
  };
  duration?: number;
}

export interface ParallelTestResults {
  results: ParallelGradingResult[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

export { ThreadEvent, ThreadItem, AgentMessageItem, CodexOptions, ThreadOptions, Usage };
