import { z } from "zod";

export const GRADING_CATEGORIES = z
  .object({
    project_purpose: z
      .object({
        summary: z
          .string()
          .describe(
            "Brief summary of what the student claims or intends the project to accomplish."
          ),
        source: z
          .string()
          .describe(
            "Where this purpose was determined from (e.g., 'Readme', 'main.py', 'inferred from code')."
          ),
      })
      .strict()
      .describe(
        "What does the project promise to do? Summarize its stated or inferred goals."
      ),

    execution_environment: z
      .object({
        platform: z
          .string()
          .describe(
            "Intended environment (e.g., command line, web app, mobile, desktop)."
          ),
        instructions: z
          .string()
          .describe("Short info on how the application is run or accessed."),
      })
      .strict()
      .describe("Where and how does the application run?"),

    logic_tracing: z
      .object({
        traceable: z
          .boolean()
          .describe(
            "True if you could understand all significant logic flows in the code, False otherwise."
          ),
        explanation: z
          .string()
          .describe(
            "Briefly explain how you traced the logic and any difficulties encountered during the process."
          ),
      })
      .strict()
      .describe("Describe whether all main logic flows were understandable."),

    confusing_parts: z
      .object({
        found: z
          .boolean()
          .describe(
            "True if confusing sections or code were found, False if everything was clear."
          ),
        details: z
          .string()
          .describe(
            "Describe the confusing parts or indicate 'None' if there were not any."
          ),
      })
      .strict()
      .describe("Highlight any parts of the project that were confusing."),

    fulfillment: z
      .object({
        accomplished: z
          .boolean()
          .describe("Did the project achieve what it set out to do?"),
        explanation: z
          .string()
          .describe("Explain why or why not, referring back to the purpose."),
      })
      .strict()
      .describe("Evaluate if the project met its stated claims and purpose."),

    complexity_and_features: z
      .object({
        complex: z
          .boolean()
          .describe(
            "True if the code shows interesting complexity or implements multiple features."
          ),
        features_summary: z
          .string()
          .describe(
            "Summarize the notable features and how they work together."
          ),
      })
      .strict()
      .describe(
        "Comment on the complexity, features, and their interplay in the project."
      ),

    structure: z
      .object({
        systematic: z
          .boolean()
          .describe(
            "Does the file/folder structure appear systematic (True) or careless (False)?"
          ),
        explanation: z
          .string()
          .describe("Explain the reasoning for this assessment."),
      })
      .strict()
      .describe("Evaluate the project’s files and folders structure."),
  })
  .strict();
