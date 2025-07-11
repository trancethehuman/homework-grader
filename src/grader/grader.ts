import { openai } from "@ai-sdk/openai";
import { generateObject, UserModelMessage } from "ai";
import { GRADING_CATEGORIES } from "./schemas.js";
import { PROMPT_GRADER } from "../prompts/grader.js";

export async function getRepoScores(repoContent: string) {
  const repoAsMessage: UserModelMessage = {
    role: "user",
    content: repoContent,
  };

  const result = generateObject({
    model: openai("gpt-4.1-mini"),
    system: PROMPT_GRADER,
    messages: [repoAsMessage],
    schema: GRADING_CATEGORIES,
  });

  return result;
}
