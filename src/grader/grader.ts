import { generateObject } from "ai";
import { GRADING_CATEGORIES } from "./schemas.js";
import { PROMPT_GRADER } from "../prompts/grader.js";
import { AIProvider } from "../consts/ai-providers.js";
import dotenv from "dotenv";

dotenv.config();

export async function getRepoScores(
  repoContent: string,
  provider: AIProvider
): Promise<any> {
  const modelInstance = await provider.getModelInstance();

  const generateObjectOptions: any = {
    model: modelInstance,
    schemaName: "Grading rubric",
    schemaDescription: "Code homework grading rubric",
    system: PROMPT_GRADER,
    prompt: repoContent,
    schema: GRADING_CATEGORIES,
  };

  if (provider.id === "openai") {
    generateObjectOptions.providerOptions = {
      openai: {
        structuredOutputs: true,
      },
    };
  }

  const result = generateObject(generateObjectOptions);

  return result;
}
