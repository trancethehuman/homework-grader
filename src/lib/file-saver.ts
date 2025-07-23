import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { usageLogger } from "./usage-logger.js";
import { AIProvider } from "../consts/ai-providers.js";

export interface ProcessResult {
  content: string;
  scores: Promise<any>;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}

export interface GradingResult {
  repositoryName: string;
  githubUrl: string;
  gradingData: any;
  usage: any;
  pageId?: string; // Notion page ID for updating existing rows
}

/**
 * Saves repository content and scores to the test-results directory
 */
export async function saveRepositoryFiles(
  repoInfo: RepoInfo,
  result: ProcessResult,
  url: string,
  provider?: AIProvider,
  pageId?: string
): Promise<GradingResult | null> {
  // Ensure test-results directory exists
  try {
    mkdirSync("test-results", { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  const fileName = `${repoInfo.owner}-${repoInfo.repo}.md`;
  const filePath = join("test-results", fileName);

  const scoresFileName = `${repoInfo.owner}-${repoInfo.repo}-scores.json`;
  const scoresFilePath = join("test-results", scoresFileName);

  // Save content immediately when available
  writeFileSync(filePath, result.content);
  console.log(`✓ Saved content to ${filePath}`);

  // Grade in parallel - content is already saved
  console.log(`Grading repository ${repoInfo.owner}/${repoInfo.repo}...`);

  try {
    const scores = await result.scores;
    const cleanedScores = {
      object: scores.object,
      usage: scores.usage,
    };
    writeFileSync(scoresFilePath, JSON.stringify(cleanedScores, null, 2));
    console.log(`✓ Saved scores to ${scoresFilePath}`);

    // Log usage metadata
    if (scores.usage && provider) {
      await usageLogger.logUsage({
        repository_name: `${repoInfo.owner}/${repoInfo.repo}`,
        github_url: url,
        provider: provider.id,
        inputTokens: scores.usage.inputTokens || 0,
        outputTokens: scores.usage.outputTokens || 0,
        totalTokens: scores.usage.totalTokens || 0,
        cachedInputTokens: scores.usage.cachedInputTokens || 0,
      });
    }

    // Return grading result for potential Notion saving
    return {
      repositoryName: `${repoInfo.owner}/${repoInfo.repo}`,
      githubUrl: url,
      gradingData: scores.object,
      usage: scores.usage,
      pageId,
    };
  } catch (gradingError) {
    const errorMessage = gradingError instanceof Error ? gradingError.message : String(gradingError);
    console.error(
      `✗ Error grading ${repoInfo.owner}/${repoInfo.repo}:`,
      errorMessage
    );
    
    // Provide more specific error context
    if (errorMessage.includes('attempts')) {
      console.error(`  → This was likely due to malformed JSON generation after multiple retry attempts`);
    } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
      console.error(`  → This appears to be a JSON parsing error`);
    }
    
    // Save an error file to track failed gradings
    const errorScores = {
      error: "Grading failed",
      message: errorMessage,
      timestamp: new Date().toISOString(),
      repository: `${repoInfo.owner}/${repoInfo.repo}`,
    };
    writeFileSync(scoresFilePath, JSON.stringify(errorScores, null, 2));
    return null;
  }
}