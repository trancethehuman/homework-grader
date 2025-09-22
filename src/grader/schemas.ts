import { z } from "zod";

export const GRADING_CATEGORIES_GEMINI = z.object({
  name: z.string(),
  age: z.number(),
  contact: z.union([
    z.object({
      type: z.literal("email"),
      value: z.string(),
    }),
    z.object({
      type: z.literal("phone"),
      value: z.string(),
    }),
  ]),
});

export const GRADING_CATEGORIES = z
  .object({
    repo_explained: z
      .string()
      .describe(
        "A very short summary (max 300 characters) of what this repository/project is about. This should be a concise explanation for the grader's understanding, focusing on the main purpose, technology stack, and type of application (e.g., 'React e-commerce app with Node.js backend', 'Python data analysis tool for CSV processing', etc.)."
      ),
    developer_feedback: z
      .string()
      .describe(
        "Actionable bullet-point feedback for the developer to implement or be aware of. Use format like 'You're doing X, which is Y' or 'You shouldn't use Z, use A instead'. Focus on specific, implementable suggestions about code quality, best practices, architecture, and improvements. Keep under 1,500 characters total."
      ),
  })
  .strict();
