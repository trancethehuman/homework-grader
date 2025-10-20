import { Codex } from "@openai/codex-sdk";
import type { Thread } from "@openai/codex-sdk";
import {
  CodexConfig,
  CodexGradingResult,
  CodexEventHandler,
  ThreadEvent,
  AgentMessageItem,
} from "./codex-types.js";

export class CodexService {
  private codex: Codex;
  private thread: Thread | null = null;
  private config: CodexConfig;

  constructor(config: CodexConfig) {
    this.config = config;
    this.codex = new Codex(config.codexOptions);
  }

  async startGrading<T = any>(
    prompt: string,
    eventHandler?: CodexEventHandler,
    outputSchema?: any
  ): Promise<CodexGradingResult<T>> {
    try {
      this.thread = this.codex.startThread({
        workingDirectory: this.config.repoPath,
        skipGitRepoCheck: this.config.skipGitRepoCheck ?? false,
      });

      const runOptions = outputSchema ? { outputSchema } : undefined;
      const { events } = await this.thread.runStreamed(prompt, runOptions);

      let lastItem = null;
      let tokensUsed = { input: 0, cached: 0, output: 0, total: 0 };

      for await (const event of events) {
        this.handleEvent(event, eventHandler);

        if (event.type === "item.updated" || event.type === "item.completed") {
          lastItem = event.item;
        }

        if (event.type === "turn.completed") {
          tokensUsed = {
            input: event.usage.input_tokens,
            cached: event.usage.cached_input_tokens,
            output: event.usage.output_tokens,
            total: event.usage.input_tokens + event.usage.output_tokens,
          };
        }
      }

      const feedback = this.extractFeedbackFromItem(lastItem);

      const structuredOutput = outputSchema ? this.parseStructuredOutput<T>(feedback) : undefined;

      return {
        success: true,
        feedback,
        structuredOutput,
        tokensUsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      if (eventHandler?.onError) {
        eventHandler.onError(
          error instanceof Error ? error : new Error(errorMessage)
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private handleEvent(event: ThreadEvent, eventHandler?: CodexEventHandler) {
    switch (event.type) {
      case "item.updated":
        if (eventHandler?.onItemUpdated) {
          eventHandler.onItemUpdated(event.item);
        }
        break;
      case "item.completed":
        if (eventHandler?.onItemCompleted) {
          eventHandler.onItemCompleted(event.item);
        }
        break;
      case "turn.completed":
        if (eventHandler?.onTurnCompleted) {
          eventHandler.onTurnCompleted(event.usage);
        }
        break;
    }
  }

  private extractFeedbackFromItem(item: any): string {
    if (!item) return "";

    if (item.type === "agent_message") {
      const agentMessage = item as AgentMessageItem;
      return agentMessage.text;
    }

    if (typeof item === "string") {
      return item;
    }

    return JSON.stringify(item, null, 2);
  }

  private parseStructuredOutput<T>(feedback: string): T | undefined {
    try {
      return JSON.parse(feedback) as T;
    } catch (error) {
      return undefined;
    }
  }

  getThreadId(): string | null {
    return this.thread?.id ?? null;
  }

  async resumeThread<T = any>(
    threadId: string,
    prompt: string,
    outputSchema?: any
  ): Promise<CodexGradingResult<T>> {
    try {
      this.thread = this.codex.resumeThread(threadId, {
        workingDirectory: this.config.repoPath,
        skipGitRepoCheck: this.config.skipGitRepoCheck ?? false,
      });

      const runOptions = outputSchema ? { outputSchema } : undefined;
      const turn = await this.thread.run(prompt, runOptions);

      const tokensUsed = turn.usage
        ? {
            input: turn.usage.input_tokens,
            cached: turn.usage.cached_input_tokens,
            output: turn.usage.output_tokens,
            total: turn.usage.input_tokens + turn.usage.output_tokens,
          }
        : undefined;

      const structuredOutput = outputSchema ? this.parseStructuredOutput<T>(turn.finalResponse) : undefined;

      return {
        success: true,
        feedback: turn.finalResponse,
        structuredOutput,
        tokensUsed,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
