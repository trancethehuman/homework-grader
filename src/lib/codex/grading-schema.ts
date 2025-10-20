export const CODEX_GRADING_SCHEMA = {
  type: "object",
  properties: {
    repo_explained: {
      type: "string",
      description: "A concise summary (2-3 sentences) explaining what the repository accomplishes, its main purpose, and key technical approach"
    },
    developer_feedback: {
      type: "string",
      description: "Detailed actionable feedback for the developer in markdown format. Include: strengths, areas for improvement, specific suggestions, and overall assessment"
    }
  },
  required: ["repo_explained", "developer_feedback"],
  additionalProperties: false
} as const;

export interface CodexGradingOutput {
  repo_explained: string;
  developer_feedback: string;
}
