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

export interface CodexGradingResult<T = any> {
  success: boolean;
  feedback?: string;
  structuredOutput?: T;
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

export interface CloneFailure {
  url: string;
  owner: string;
  repo: string;
  error: string;
}

export interface CloneResults {
  successful: ClonedTestRepo[];
  failed: CloneFailure[];
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
  cloneFailures: CloneFailure[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

export { ThreadEvent, ThreadItem, AgentMessageItem, CodexOptions, ThreadOptions, Usage };
