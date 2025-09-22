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
    feedbacks: z
      .string()
      .describe(
        "Comprehensive feedback covering all aspects of the project including: project purpose and goals, execution environment, code traceability, confusing parts, fulfillment assessment, complexity and features, file structure, code quality, best practices, documentation, testing, and any technology-specific recommendations (e.g., Python UV vs requirements.txt usage). Provide detailed, constructive feedback in markdown format."
      ),
  })
  .strict();
