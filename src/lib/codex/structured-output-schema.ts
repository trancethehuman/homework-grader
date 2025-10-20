/**
 * Structured output schema for Codex grading responses
 * This ensures consistent, parseable responses that can be saved to Notion
 */

export interface CodexGradingStructuredOutput {
  repo_explained: string;
  developer_feedback: string;
}

/**
 * JSON Schema for Codex structured output
 * Used with outputSchema parameter in Codex SDK
 */
export const CODEX_GRADING_SCHEMA = {
  type: "object",
  properties: {
    repo_explained: {
      type: "string",
      description: "A concise summary explaining what this repository/project does, its main purpose, and key features. Should be 2-3 sentences maximum."
    },
    developer_feedback: {
      type: "string",
      description: "Comprehensive feedback for the developer including what was done well, areas for improvement, and specific actionable recommendations. Use markdown formatting with bullet points for clarity."
    }
  },
  required: ["repo_explained", "developer_feedback"],
  additionalProperties: false
} as const;

/**
 * Helper to parse structured output from Codex response
 */
export function parseCodexStructuredOutput(response: string): CodexGradingStructuredOutput {
  try {
    const parsed = JSON.parse(response);

    // Validate required fields
    if (!parsed.repo_explained || !parsed.developer_feedback) {
      throw new Error("Missing required fields in structured output");
    }

    return {
      repo_explained: parsed.repo_explained,
      developer_feedback: parsed.developer_feedback
    };
  } catch (error) {
    throw new Error(`Failed to parse Codex structured output: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Helper to check if response is structured output
 */
export function isStructuredOutput(response: string): boolean {
  try {
    const parsed = JSON.parse(response);
    return !!(parsed.repo_explained && parsed.developer_feedback);
  } catch {
    return false;
  }
}
