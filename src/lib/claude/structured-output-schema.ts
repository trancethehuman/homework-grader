import type { GradingStructuredOutput } from "../agents/types.js";

export const CLAUDE_GRADING_SCHEMA = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      repo_explained: {
        type: "string",
        description:
          "A concise summary explaining what this repository/project does, its main purpose, and key features. Should be 2-3 sentences maximum.",
      },
      developer_feedback: {
        type: "string",
        description:
          "Comprehensive feedback for the developer including what was done well, areas for improvement, and specific actionable recommendations. Use markdown formatting with bullet points for clarity.",
      },
    },
    required: ["repo_explained", "developer_feedback"],
    additionalProperties: false,
  },
};

export function parseClaudeStructuredOutput(
  response: unknown
): GradingStructuredOutput {
  if (typeof response === "object" && response !== null) {
    const data = response as Record<string, unknown>;
    if (
      typeof data.repo_explained === "string" &&
      typeof data.developer_feedback === "string"
    ) {
      return {
        repo_explained: data.repo_explained,
        developer_feedback: data.developer_feedback,
      };
    }
  }

  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response);
      if (parsed.repo_explained && parsed.developer_feedback) {
        return {
          repo_explained: parsed.repo_explained,
          developer_feedback: parsed.developer_feedback,
        };
      }
    } catch {
      // Not JSON, continue
    }
  }

  throw new Error("Invalid structured output format");
}

export function isStructuredOutput(response: unknown): boolean {
  if (typeof response === "object" && response !== null) {
    const data = response as Record<string, unknown>;
    return !!(data.repo_explained && data.developer_feedback);
  }

  if (typeof response === "string") {
    try {
      const parsed = JSON.parse(response);
      return !!(parsed.repo_explained && parsed.developer_feedback);
    } catch {
      return false;
    }
  }

  return false;
}
