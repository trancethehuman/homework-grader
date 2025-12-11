import type { ClaudeAgentEventHandler } from "./claude-types.js";

export interface HookInput {
  hook_event_name: string;
  session_id: string;
  transcript_path: string;
  cwd: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_use_id?: string;
  error?: string;
}

export interface HookOutput {
  continue?: boolean;
  suppressOutput?: boolean;
}

export type HookCallback = (
  input: HookInput,
  toolUseId: string | undefined,
  options: { signal: AbortSignal }
) => Promise<HookOutput>;

export interface HookCallbackMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}

export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Notification"
  | "UserPromptSubmit"
  | "SessionStart"
  | "SessionEnd"
  | "Stop"
  | "SubagentStart"
  | "SubagentStop"
  | "PreCompact"
  | "PermissionRequest";

export type GradingHooks = Partial<Record<HookEvent, HookCallbackMatcher[]>>;

export function createGradingHooks(
  eventHandler?: ClaudeAgentEventHandler
): GradingHooks {
  if (!eventHandler) {
    return {};
  }

  const hooks: GradingHooks = {};

  if (eventHandler.onToolStart) {
    hooks.PreToolUse = [
      {
        hooks: [
          async (input: HookInput) => {
            if (input.hook_event_name === "PreToolUse" && input.tool_name) {
              eventHandler.onToolStart?.(input.tool_name, input.tool_input);
            }
            return { continue: true };
          },
        ],
      },
    ];
  }

  if (eventHandler.onToolComplete) {
    hooks.PostToolUse = [
      {
        hooks: [
          async (input: HookInput) => {
            if (input.hook_event_name === "PostToolUse" && input.tool_name) {
              eventHandler.onToolComplete?.(input.tool_name, input.tool_response);
            }
            return { continue: true };
          },
        ],
      },
    ];
  }

  if (eventHandler.onToolError) {
    hooks.PostToolUseFailure = [
      {
        hooks: [
          async (input: HookInput) => {
            if (input.hook_event_name === "PostToolUseFailure" && input.tool_name) {
              eventHandler.onToolError?.(input.tool_name, input.error ?? "Unknown error");
            }
            return { continue: true };
          },
        ],
      },
    ];
  }

  if (eventHandler.onSessionStart) {
    hooks.SessionStart = [
      {
        hooks: [
          async () => {
            eventHandler.onSessionStart?.();
            return { continue: true };
          },
        ],
      },
    ];
  }

  if (eventHandler.onSessionEnd) {
    hooks.SessionEnd = [
      {
        hooks: [
          async () => {
            eventHandler.onSessionEnd?.();
            return { continue: true };
          },
        ],
      },
    ];
  }

  return hooks;
}
