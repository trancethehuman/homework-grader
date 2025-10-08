import { generateObject } from "ai";
import { GRADING_CATEGORIES } from "./schemas.js";
import {
  PROMPT_GRADER,
  PROMPT_GRADER_CHUNK,
  PROMPT_GRADER_FINAL,
  RETRY_FRAGMENTS,
  appendToPrompt,
} from "../prompts/grader.js";
import { getDefaultGradingPrompt } from "../consts/grading-prompts.js";
import {
  AIProvider,
  DEFAULT_CONTEXT_WINDOW_TOKENS,
} from "../consts/ai-providers.js";
import { RateLimiter } from "../lib/rate-limiter.js";
import dotenv from "dotenv";

dotenv.config();

interface ContentChunk {
  content: string;
  chunkIndex: number;
  totalChunks: number;
}

interface ChunkFeedback {
  chunkIndex: number;
  repo_explained: string;
  developer_feedback: string;
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitRepositoryContent(
  content: string,
  maxTokens: number
): ContentChunk[] {
  const estimatedTokens = estimateTokenCount(content);

  if (estimatedTokens <= maxTokens) {
    return [{ content, chunkIndex: 1, totalChunks: 1 }];
  }

  const lines = content.split("\n");
  const chunks: ContentChunk[] = [];
  let currentChunk = "";
  let currentTokens = 0;
  const targetTokensPerChunk = Math.floor(maxTokens * 0.8);
  const overlapLines = 10;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokenCount(line);

    if (
      currentTokens + lineTokens > targetTokensPerChunk &&
      currentChunk.length > 0
    ) {
      chunks.push({
        content: currentChunk.trim(),
        chunkIndex: chunks.length + 1,
        totalChunks: 0,
      });

      const overlapStart = Math.max(0, i - overlapLines);
      currentChunk = lines.slice(overlapStart, i + 1).join("\n");
      currentTokens = estimateTokenCount(currentChunk);
    } else {
      currentChunk += line + "\n";
      currentTokens += lineTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunks.length + 1,
      totalChunks: 0,
    });
  }

  chunks.forEach((chunk) => {
    chunk.totalChunks = chunks.length;
  });

  return chunks;
}

async function processContentChunk(
  chunk: ContentChunk,
  provider: AIProvider,
  previousFeedbacks: ChunkFeedback[] = [],
  rateLimiter?: RateLimiter
): Promise<ChunkFeedback> {
  const modelInstance = await provider.getModelInstance();

  let prompt = chunk.content;
  if (previousFeedbacks.length > 0) {
    const previousContext = previousFeedbacks
      .map(
        (fb) =>
          `Previous analysis ${
            fb.chunkIndex
          }: ${fb.developer_feedback.substring(0, 500)}...`
      )
      .join("\n\n");
    prompt = `Previous analysis context:\n${previousContext}\n\n---\n\nCurrent content to analyze:\n${chunk.content}`;
  }

  const generateObjectOptions: any = {
    model: modelInstance,
    schemaName: "Chunk Grading feedback",
    schemaDescription: "Partial code homework feedback for content chunk",
    system: PROMPT_GRADER_CHUNK.replace(
      "{CHUNK_INDEX}",
      chunk.chunkIndex.toString()
    ).replace("{TOTAL_CHUNKS}", chunk.totalChunks.toString()),
    prompt,
    schema: GRADING_CATEGORIES,
  };

  if (provider.id === "openai") {
    generateObjectOptions.providerOptions = {
      openai: {
        structuredOutputs: true,
      },
    };
  }

  if (provider.id === "gpt-5") {
    generateObjectOptions.providerOptions = {
      openai: {
        reasoning_effort: "low",
        textVerbosity: "low",
        reasoningSummary: "detailed",
      },
    };
  }

  if (provider.id === "gemini-pro") {
    generateObjectOptions.providerOptions = {
      google: {
        thinkingConfig: {
          thinkingBudget: 128,
        },
      },
    };
  }

  if (rateLimiter) {
    const estimatedInputTokens = estimateTokenCount(
      generateObjectOptions.system + prompt
    );
    const estimatedOutputTokens = 2000;

    const waitTime = rateLimiter.checkRateLimit(
      estimatedInputTokens,
      estimatedOutputTokens
    );
    if (waitTime > 0) {
      console.log(`⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before grading chunk ${chunk.chunkIndex}...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  const result = await generateObject(generateObjectOptions);

  if (rateLimiter && result.usage) {
    rateLimiter.recordTokenUsage(
      result.usage.inputTokens || 0,
      result.usage.outputTokens || 0
    );
  }

  if (!result.object) {
    throw new Error("Generated object is null or invalid");
  }

  const parsedResult = GRADING_CATEGORIES.parse(result.object);

  return {
    chunkIndex: chunk.chunkIndex,
    repo_explained: parsedResult.repo_explained,
    developer_feedback: parsedResult.developer_feedback,
  };
}

async function aggregateChunkFeedbacks(
  chunkFeedbacks: ChunkFeedback[],
  provider: AIProvider,
  originalContent: string,
  rateLimiter?: RateLimiter
): Promise<any> {
  const modelInstance = await provider.getModelInstance();

  const aggregatedRepoExplanations = chunkFeedbacks
    .map((cf) => `Chunk ${cf.chunkIndex}: ${cf.repo_explained}`)
    .join(" ");

  const aggregatedFeedback = chunkFeedbacks
    .map(
      (cf) =>
        `## Chunk ${cf.chunkIndex} Developer Feedback:\n${cf.developer_feedback}`
    )
    .join("\n\n---\n\n");

  const prompt = `Repository insights from chunks: ${aggregatedRepoExplanations}\n\nDeveloper feedback from chunks:\n${aggregatedFeedback}`;

  const contentSummary = `Repository processed in ${
    chunkFeedbacks.length
  } chunks due to size constraints.\n\nEstimated total tokens: ${estimateTokenCount(
    originalContent
  )}`;

  const generateObjectOptions: any = {
    model: modelInstance,
    schemaName: "Final Grading feedback",
    schemaDescription:
      "Comprehensive code homework feedback aggregated from chunks",
    system: PROMPT_GRADER_FINAL,
    prompt: prompt,
    schema: GRADING_CATEGORIES,
  };

  if (provider.id === "openai") {
    generateObjectOptions.providerOptions = {
      openai: {
        structuredOutputs: true,
      },
    };
  }

  if (provider.id === "gpt-5") {
    generateObjectOptions.providerOptions = {
      openai: {
        reasoning_effort: "low",
        textVerbosity: "low",
        reasoningSummary: "detailed",
      },
    };
  }

  if (provider.id === "gemini-pro") {
    generateObjectOptions.providerOptions = {
      google: {
        thinkingConfig: {
          thinkingBudget: 128,
        },
      },
    };
  }

  if (rateLimiter) {
    const estimatedInputTokens = estimateTokenCount(
      generateObjectOptions.system + generateObjectOptions.prompt
    );
    const estimatedOutputTokens = 2000;

    const waitTime = rateLimiter.checkRateLimit(
      estimatedInputTokens,
      estimatedOutputTokens
    );
    if (waitTime > 0) {
      console.log(`⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before aggregating feedback...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  const result = await generateObject(generateObjectOptions);

  if (rateLimiter && result.usage) {
    rateLimiter.recordTokenUsage(
      result.usage.inputTokens || 0,
      result.usage.outputTokens || 0
    );
  }

  if (!result.object) {
    throw new Error("Generated object is null or invalid");
  }

  GRADING_CATEGORIES.parse(result.object);

  return result;
}

export async function getRepoScores(
  repoContent: string,
  provider: AIProvider,
  chunkingPreference: "allow" | "skip" = "allow",
  selectedPrompt?: string,
  rateLimiter?: RateLimiter
): Promise<any> {
  const contextLimit =
    provider.contextWindowTokens || DEFAULT_CONTEXT_WINDOW_TOKENS;
  const reservedTokensForSystemPrompt = 2000;
  const maxContentTokens = contextLimit - reservedTokensForSystemPrompt;

  const estimatedTokens = estimateTokenCount(repoContent);

  if (estimatedTokens <= maxContentTokens) {
    console.log(
      `📊 Content size: ${estimatedTokens} tokens (within ${contextLimit} limit)`
    );
    return await processStandardGrading(repoContent, provider, selectedPrompt, rateLimiter);
  }

  console.log(
    `⚠️  Large repository detected: ${estimatedTokens} tokens exceeds ${maxContentTokens} limit`
  );

  if (chunkingPreference === "skip") {
    console.log(
      `⏭️  Skipping large repository as requested by user preference`
    );
    throw new Error(
      `Repository too large (${estimatedTokens} tokens > ${maxContentTokens} limit). Skipped by user preference.`
    );
  }

  console.log(`🔄 Processing repository in chunks with parallel processing...`);

  const chunks = splitRepositoryContent(repoContent, maxContentTokens);
  console.log(`📦 Split into ${chunks.length} chunks for parallel processing`);

  // Process chunks in parallel for better performance
  const chunkPromises = chunks.map(async (chunk) => {
    console.log(
      `⚙️  Starting chunk ${chunk.chunkIndex}/${chunk.totalChunks}...`
    );
    try {
      // Note: We can't pass previous feedbacks in parallel mode, so each chunk is independent
      const chunkFeedback = await processContentChunk(chunk, provider, [], rateLimiter);
      console.log(`✓ Completed chunk ${chunk.chunkIndex}/${chunk.totalChunks}`);
      return chunkFeedback;
    } catch (error) {
      console.warn(
        `⚠️  Failed to process chunk ${chunk.chunkIndex}:`,
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
  });

  console.log(`🚀 Processing ${chunks.length} chunks in parallel...`);
  const chunkResults = await Promise.all(chunkPromises);
  const chunkFeedbacks = chunkResults.filter(
    (result): result is ChunkFeedback => result !== null
  );

  if (chunkFeedbacks.length === 0) {
    throw new Error("Failed to process any chunks of the repository");
  }

  console.log(
    `✓ Completed ${chunkFeedbacks.length}/${chunks.length} chunks successfully`
  );
  console.log(
    `🔗 Aggregating feedback from ${chunkFeedbacks.length} chunks...`
  );
  return await aggregateChunkFeedbacks(chunkFeedbacks, provider, repoContent, rateLimiter);
}

async function processStandardGrading(
  repoContent: string,
  provider: AIProvider,
  selectedPrompt?: string,
  rateLimiter?: RateLimiter
): Promise<any> {
  const modelInstance = await provider.getModelInstance();

  // Use selected prompt or fall back to default
  const promptToUse = selectedPrompt || getDefaultGradingPrompt().value;

  const generateObjectOptions: any = {
    model: modelInstance,
    schemaName: "Grading feedback",
    schemaDescription: "Comprehensive code homework feedback",
    system: promptToUse,
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

  if (provider.id === "gpt-5") {
    generateObjectOptions.providerOptions = {
      openai: {
        reasoning_effort: "low",
        textVerbosity: "low",
        reasoningSummary: "detailed",
      },
    };
  }

  if (provider.id === "gemini-pro") {
    generateObjectOptions.providerOptions = {
      google: {
        thinkingConfig: {
          thinkingBudget: 128,
        },
      },
    };
  }

  // Implement retry logic for generating comprehensive feedback
  let maxRetries = 2;
  let lastError: Error | null = null;
  let isRateLimitError = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (rateLimiter) {
        const estimatedInputTokens = estimateTokenCount(
          generateObjectOptions.system + generateObjectOptions.prompt
        );
        const estimatedOutputTokens = 2000;

        const waitTime = rateLimiter.checkRateLimit(
          estimatedInputTokens,
          estimatedOutputTokens
        );
        if (waitTime > 0) {
          console.log(`⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before grading (attempt ${attempt})...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      const result = await generateObject(generateObjectOptions);

      if (rateLimiter && result.usage) {
        rateLimiter.recordTokenUsage(
          result.usage.inputTokens || 0,
          result.usage.outputTokens || 0
        );
      }

      // Validate the result has the expected structure
      if (!result.object || typeof result.object !== "object") {
        throw new Error("Generated object is null or invalid");
      }

      // Additional validation: ensure the object matches our schema structure
      try {
        GRADING_CATEGORIES.parse(result.object);
        console.log(`✓ Grading successful on attempt ${attempt}`);
        return result;
      } catch (validationError) {
        throw new Error(
          `Schema validation failed: ${
            validationError instanceof Error
              ? validationError.message
              : String(validationError)
          }`
        );
      }
    } catch (error) {
      lastError = error as Error;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if this is a rate limit error
      isRateLimitError =
        errorMsg.includes("quota exceeded") ||
        errorMsg.includes("rate limit") ||
        errorMsg.includes("429") ||
        errorMsg.includes("Too Many Requests");

      console.warn(
        `⚠️  Grading attempt ${attempt} failed:`,
        errorMsg
      );

      // For rate limit errors, allow more retries
      if (isRateLimitError && maxRetries < 4) {
        maxRetries = 4;
      }

      if (attempt < maxRetries) {
        let waitTime = 1000;

        if (isRateLimitError) {
          // Try to parse retry-after time from error message
          if (rateLimiter) {
            const parsedWait = rateLimiter.parseRetryAfter(lastError);
            if (parsedWait) {
              waitTime = parsedWait + 1000; // Add 1 second buffer
              console.log(`⏳ Rate limit error: waiting ${Math.ceil(waitTime / 1000)}s as requested by API...`);
            } else {
              // Use exponential backoff for rate limit errors
              waitTime = Math.min(20000, 5000 * Math.pow(2, attempt - 1));
              console.log(`⏳ Rate limit error: waiting ${Math.ceil(waitTime / 1000)}s (exponential backoff)...`);
            }

            // Record rate limit hit to update internal tracking
            rateLimiter.recordRateLimitHit(waitTime);
          }
        } else {
          // Adapt the retry strategy based on the error type
          console.log(
            `🔄 Retrying grading (attempt ${attempt + 1}/${maxRetries})...`
          );

          if (errorMsg.includes("Schema validation failed")) {
            // Schema validation error - provide more specific guidance
            generateObjectOptions.system = appendToPrompt(
              promptToUse,
              RETRY_FRAGMENTS.SCHEMA_VALIDATION
            );
          } else if (errorMsg.includes("JSON") || errorMsg.includes("parse")) {
            // JSON parsing error - focus on format
            generateObjectOptions.system = appendToPrompt(
              promptToUse,
              RETRY_FRAGMENTS.JSON_FORMAT
            );
          } else {
            // Generic error - general improvement guidance
            generateObjectOptions.system = appendToPrompt(
              promptToUse,
              RETRY_FRAGMENTS.GENERIC
            );
          }
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  // If all retries failed, throw the last error
  throw new Error(
    `Grading failed after ${maxRetries} attempts. Last error: ${
      lastError?.message || "Unknown error"
    }`
  );
}
