import type {
  ThreadEvent,
  ThreadItem,
  AgentMessageItem,
  CodexOptions,
  ThreadOptions,
  Usage,
} from "@openai/codex-sdk";
import type { CodexGradingStructuredOutput } from "./structured-output-schema.js";
import type {
  AgentConfig,
  GradingResult,
  ClonedRepo,
  CloneFailure as BaseCloneFailure,
  CloneResults as BaseCloneResults,
  ParallelGradingResult as BaseParallelGradingResult,
  ParallelGradingResults,
} from "../agents/types.js";

export interface CodexConfig extends AgentConfig {
  codexOptions?: CodexOptions;
}

export interface CodexThreadConfig {
  workingDirectory: string;
  skipGitRepoCheck: boolean;
  model?: string;
}

export interface CodexGradingResult extends GradingResult {
  structuredData?: CodexGradingStructuredOutput;
}

export interface CodexEventHandler {
  onItemUpdated?: (item: ThreadItem) => void;
  onItemCompleted?: (item: ThreadItem) => void;
  onTurnCompleted?: (usage: Usage) => void;
  onError?: (error: Error) => void;
}

export type ClonedTestRepo = ClonedRepo;
export type CloneFailure = BaseCloneFailure;
export type CloneResults = BaseCloneResults;

export interface ParallelGradingResult extends BaseParallelGradingResult {
  structuredData?: CodexGradingStructuredOutput;
}

export interface ParallelTestResults extends ParallelGradingResults {
  results: ParallelGradingResult[];
}

export { ThreadEvent, ThreadItem, AgentMessageItem, CodexOptions, ThreadOptions, Usage };
