import { query } from "@anthropic-ai/claude-agent-sdk";
import type { HookEvent, HookCallbackMatcher, HookInput } from "@anthropic-ai/claude-agent-sdk";
import type { ClaudeAgentConfig, ClaudeAgentEventHandler, ClaudeGradingResult } from "./claude-types.js";
import type { IGradingAgentService, GradingStructuredOutput, AgentEventHandler } from "../agents/types.js";
import {
  CLAUDE_GRADING_SCHEMA,
  parseClaudeStructuredOutput,
  isStructuredOutput,
} from "./structured-output-schema.js";

function createHooks(eventHandler?: AgentEventHandler): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    PreToolUse: [{
      hooks: [async (input: HookInput) => {
        if (input.hook_event_name === "PreToolUse" && "tool_name" in input) {
          eventHandler?.onToolStart?.(input.tool_name, (input as { tool_input: unknown }).tool_input);
        }
        return { continue: true };
      }]
    }],
    PostToolUse: [{
      hooks: [async (input: HookInput) => {
        if (input.hook_event_name === "PostToolUse" && "tool_name" in input) {
          eventHandler?.onToolComplete?.(input.tool_name, (input as { tool_response: unknown }).tool_response);
        }
        return { continue: true };
      }]
    }],
    PostToolUseFailure: [{
      hooks: [async (input: HookInput) => {
        if (input.hook_event_name === "PostToolUseFailure" && "tool_name" in input) {
          eventHandler?.onToolError?.(input.tool_name, (input as { error: string }).error);
        }
        return { continue: true };
      }]
    }]
  };
}

export class ClaudeAgentService implements IGradingAgentService {
  private config: ClaudeAgentConfig;
  private sessionId: string | null = null;

  constructor(config: ClaudeAgentConfig) {
    this.config = config;
  }

  async startGrading(
    prompt: string,
    eventHandler?: AgentEventHandler,
    useStructuredOutput: boolean = false
  ): Promise<ClaudeGradingResult> {
    try {
      const queryOptions: Record<string, unknown> = {
        model: this.config.model || "claude-sonnet-4-5-20250929",
        cwd: this.config.repoPath,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        tools: { type: "preset", preset: "claude_code" },
        systemPrompt: { type: "preset", preset: "claude_code" },
        hooks: createHooks(eventHandler),
      };

      if (useStructuredOutput) {
        queryOptions.outputFormat = CLAUDE_GRADING_SCHEMA;
      }

      const q = query({
        prompt,
        options: queryOptions as Parameters<typeof query>[0]["options"],
      });

      let finalResult = "";
      let structuredOutput: unknown = undefined;
      let tokensUsed = { input: 0, cached: 0, output: 0, total: 0 };
      let costUsd = 0;
      let durationMs = 0;

      for await (const msg of q) {
        if (msg.type === "system" && msg.subtype === "init") {
          this.sessionId = msg.session_id;
          eventHandler?.onSessionStart?.();
        }

        if (msg.type === "assistant") {
          const content = msg.message.content as Array<{ type: string; text?: string }>;
          const textContent = content
            .filter((block) => block.type === "text" && block.text)
            .map((block) => block.text!)
            .join("");

          if (textContent) {
            eventHandler?.onStreamingMessage?.(textContent);
          }
        }

        if (msg.type === "result") {
          if (msg.subtype === "success") {
            finalResult = msg.result;
            structuredOutput = msg.structured_output;
            tokensUsed = {
              input: msg.usage.input_tokens ?? 0,
              cached: msg.usage.cache_read_input_tokens ?? 0,
              output: msg.usage.output_tokens ?? 0,
              total: (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0),
            };
            costUsd = msg.total_cost_usd;
            durationMs = msg.duration_ms;

            eventHandler?.onTurnCompleted?.(tokensUsed);
          } else {
            const errorResult = msg as {
              type: "result";
              subtype: string;
              errors?: string[];
              duration_ms: number;
              total_cost_usd: number;
              usage: { input_tokens: number | null; output_tokens: number | null };
            };

            const errorMessage = errorResult.errors?.join(", ") ?? "Unknown error";
            eventHandler?.onError?.(new Error(errorMessage));

            return {
              success: false,
              error: errorMessage,
              sessionId: this.sessionId ?? undefined,
              costUsd: errorResult.total_cost_usd,
              durationMs: errorResult.duration_ms,
            };
          }
        }
      }

      eventHandler?.onSessionEnd?.();

      let structuredData: GradingStructuredOutput | undefined;
      if (useStructuredOutput && structuredOutput) {
        try {
          structuredData = parseClaudeStructuredOutput(structuredOutput);
        } catch {
          if (isStructuredOutput(finalResult)) {
            structuredData = parseClaudeStructuredOutput(finalResult);
          }
        }
      }

      return {
        success: true,
        feedback: finalResult,
        structuredData,
        tokensUsed,
        sessionId: this.sessionId ?? undefined,
        costUsd,
        durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      eventHandler?.onError?.(
        error instanceof Error ? error : new Error(errorMessage)
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
