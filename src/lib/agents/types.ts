export interface AgentModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface GradingStructuredOutput {
  repo_explained: string;
  developer_feedback: string;
}

export interface GradingResult {
  success: boolean;
  feedback?: string;
  structuredData?: GradingStructuredOutput;
  grade?: number;
  error?: string;
  tokensUsed?: {
    input: number;
    cached: number;
    output: number;
    total: number;
  };
}

export interface ParallelGradingResult extends GradingResult {
  repoInfo: {
    url: string;
    owner: string;
    repo: string;
  };
  duration?: number;
}

export interface ClonedRepo {
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
  successful: ClonedRepo[];
  failed: CloneFailure[];
}

export interface ParallelGradingResults {
  results: ParallelGradingResult[];
  cloneFailures: CloneFailure[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
}

export interface AgentEventHandler {
  onToolStart?: (toolName: string, toolInput: unknown) => void;
  onToolComplete?: (toolName: string, toolOutput: unknown) => void;
  onToolError?: (toolName: string, error: string) => void;
  onMessage?: (message: string) => void;
  onStreamingMessage?: (partialMessage: string) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
  onTurnCompleted?: (usage: { input: number; cached: number; output: number }) => void;
  onError?: (error: Error) => void;
}

export interface RepoEventData {
  type: 'initializing' | 'tool_start' | 'tool_complete' | 'message' | 'turn_completed' | 'error' | 'item_updated' | 'item_completed';
  data?: unknown;
}

export interface AgentConfig {
  repoPath: string;
  model?: string;
  skipGitRepoCheck?: boolean;
}

export interface IGradingAgentService {
  startGrading(
    prompt: string,
    eventHandler?: AgentEventHandler,
    useStructuredOutput?: boolean
  ): Promise<GradingResult>;
  getSessionId(): string | null;
}

export interface IParallelGradingAgentService {
  cloneRepositories(
    onProgress?: (message: string, repoIndex: number, total: number) => void
  ): Promise<CloneResults>;
  runParallelGrading(
    prompt: string,
    onRepoStart?: (repoInfo: { owner: string; repo: string }) => void,
    onRepoComplete?: (result: ParallelGradingResult) => void,
    onRepoEvent?: (repoInfo: { owner: string; repo: string }, event: RepoEventData) => void,
    useStructuredOutput?: boolean
  ): Promise<ParallelGradingResults>;
  cleanup(): void;
  abort(): void;
  stopRepo(owner: string, repo: string): void;
  getTempDir(): string | null;
  getUrls(): string[];
}

export type AgentType = 'codex' | 'claude-agent';
