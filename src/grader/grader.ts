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
    schemaName: "Grading feedback",
    schemaDescription: "Comprehensive code homework feedback",
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

  // Implement retry logic for generating comprehensive feedback
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateObject(generateObjectOptions);

      // Validate the result has the expected structure
      if (!result.object || typeof result.object !== 'object') {
        throw new Error('Generated object is null or invalid');
      }

      // Additional validation: ensure the object matches our schema structure
      try {
        GRADING_CATEGORIES.parse(result.object);
        console.log(`✓ Grading successful on attempt ${attempt}`);
        return result;
      } catch (validationError) {
        throw new Error(`Schema validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
      }
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️  Grading attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error));

      if (attempt < maxRetries) {
        console.log(`🔄 Retrying grading (attempt ${attempt + 1}/${maxRetries})...`);

        // Adapt the retry strategy based on the error type
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('Schema validation failed')) {
          // Schema validation error - provide more specific guidance
          generateObjectOptions.system = PROMPT_GRADER +
            "\n\nIMPORTANT: The previous attempt failed schema validation. Please ensure:\n" +
            "- Your response contains a single 'feedbacks' field with comprehensive markdown-formatted feedback\n" +
            "- The feedback should be detailed, well-structured, and cover all the specified areas\n" +
            "- Use proper markdown formatting with headers, bullet points, and code examples where appropriate";
        } else if (errorMsg.includes('JSON') || errorMsg.includes('parse')) {
          // JSON parsing error - focus on format
          generateObjectOptions.system = PROMPT_GRADER +
            "\n\nIMPORTANT: The previous attempt had JSON formatting issues. Please ensure:\n" +
            "- Valid JSON syntax with proper brackets, quotes, and commas\n" +
            "- The feedbacks field contains a properly escaped string\n" +
            "- All special characters in the markdown are properly escaped for JSON";
        } else {
          // Generic error - general improvement guidance
          generateObjectOptions.system = PROMPT_GRADER +
            "\n\nIMPORTANT: The previous attempt failed. Please ensure your response strictly follows the provided schema with a single 'feedbacks' field containing comprehensive, well-formatted feedback.";
        }

        // Add a small delay between retries
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // If all retries failed, throw the last error
  throw new Error(`Grading failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
}
