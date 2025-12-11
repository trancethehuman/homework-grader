import { Codex } from "@openai/codex-sdk";
import type { Thread } from "@openai/codex-sdk";
import {
  CodexConfig,
  CodexGradingResult,
  CodexEventHandler,
  ThreadEvent,
  AgentMessageItem,
} from "./codex-types.js";
import {
  CODEX_GRADING_SCHEMA,
  parseCodexStructuredOutput,
  isStructuredOutput,
  type CodexGradingStructuredOutput,
} from "./structured-output-schema.js";

export class CodexService {
  private codex: Codex;
  private thread: Thread | null = null;
  private config: CodexConfig;

  constructor(config: CodexConfig) {
    this.config = config;
    this.codex = new Codex(config.codexOptions);
  }

  async startGrading(
    prompt: string,
    eventHandler?: CodexEventHandler,
    useStructuredOutput: boolean = false
  ): Promise<CodexGradingResult> {
    try {
      this.thread = this.codex.startThread({
        workingDirectory: this.config.repoPath,
        skipGitRepoCheck: this.config.skipGitRepoCheck ?? false,
      });

      // Use structured output schema for consistent Notion-compatible responses
      const runOptions = useStructuredOutput
        ? { outputSchema: CODEX_GRADING_SCHEMA }
        : {};

      const { events } = await this.thread.runStreamed(prompt, runOptions as any);

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

      // Parse structured output if using schema
      let structuredData: CodexGradingStructuredOutput | undefined;
      if (useStructuredOutput && feedback && isStructuredOutput(feedback)) {
        try {
          structuredData = parseCodexStructuredOutput(feedback);
        } catch (error) {
          console.warn("Failed to parse structured output, falling back to raw feedback");
        }
      }

      return {
        success: true,
        feedback,
        structuredData,
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

  getThreadId(): string | null {
    return this.thread?.id ?? null;
  }

  async resumeThread(threadId: string, prompt: string): Promise<CodexGradingResult> {
    try {
      this.thread = this.codex.resumeThread(threadId, {
        workingDirectory: this.config.repoPath,
        skipGitRepoCheck: this.config.skipGitRepoCheck ?? false,
      });
      const turn = await this.thread.run(prompt);

      const tokensUsed = turn.usage
        ? {
            input: turn.usage.input_tokens,
            cached: turn.usage.cached_input_tokens,
            output: turn.usage.output_tokens,
            total: turn.usage.input_tokens + turn.usage.output_tokens,
          }
        : undefined;

      return {
        success: true,
        feedback: turn.finalResponse,
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
