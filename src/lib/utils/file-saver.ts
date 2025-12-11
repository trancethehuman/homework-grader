import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { usageLogger } from "./usage-logger.js";
import { AIProvider } from "../../consts/ai-providers.js";

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
  browserTestResults?: any[]; // Browser testing results if available
  error?: string; // Error message if grading failed
}

export interface ParallelGradingResultInput {
  success: boolean;
  feedback?: string;
  structuredData?: {
    repo_explained: string;
    developer_feedback: string;
  };
  error?: string;
  tokensUsed?: {
    input: number;
    cached: number;
    output: number;
    total: number;
  };
  repoInfo: {
    url: string;
    owner: string;
    repo: string;
  };
}

/**
 * Converts a parallel grading result to a GradingResult format.
 * Handles missing structuredData gracefully by using feedback as fallback.
 */
export function convertToGradingResult(
  result: ParallelGradingResultInput,
  pageId?: string
): GradingResult {
  const gradingData = result.structuredData
    ? {
        repo_explained: result.structuredData.repo_explained,
        developer_feedback: result.structuredData.developer_feedback,
      }
    : {
        repo_explained: "",
        developer_feedback: result.feedback || "",
      };

  return {
    repositoryName: `${result.repoInfo.owner}/${result.repoInfo.repo}`,
    githubUrl: result.repoInfo.url,
    gradingData,
    usage: result.tokensUsed,
    pageId,
    error: result.error,
  };
}

/**
 * Converts an array of parallel grading results to GradingResult format.
 * Only includes successful results.
 */
export function convertParallelResultsToGradingResults(
  results: ParallelGradingResultInput[],
  urlToPageIdMap?: Map<string, string>
): GradingResult[] {
  return results
    .filter((r) => r.success)
    .map((r) => {
      let pageId: string | undefined;
      if (urlToPageIdMap) {
        const normalizedUrl = r.repoInfo.url
          .replace(/\.git$/, "")
          .replace(/\/$/, "");
        pageId = urlToPageIdMap.get(normalizedUrl);
      }
      return convertToGradingResult(r, pageId);
    });
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
): Promise<GradingResult> {
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

    // Return GradingResult with error information for Notion integration
    return {
      repositoryName: `${repoInfo.owner}/${repoInfo.repo}`,
      githubUrl: url,
      gradingData: null, // No grading data since it failed
      usage: null, // No usage data since grading failed
      pageId,
      error: errorMessage,
    };
  }
}

/**
 * Saves browser test results to files in the test-results directory
 */
export function saveBrowserTestResults(
  results: any[],
  column: string
): void {
  // Ensure test-results directory exists
  try {
    mkdirSync("test-results", { recursive: true });
  } catch (error) {
    // Directory might already exist
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `browser-tests-${timestamp}.json`;
  const filePath = join("test-results", fileName);

  const browserTestData = {
    timestamp: new Date().toISOString(),
    column: column,
    totalUrls: results.length,
    successfulTests: results.filter(r => r.success).length,
    failedTests: results.filter(r => !r.success).length,
    results: results.map(result => ({
      url: result.url,
      success: result.success,
      duration: result.duration,
      actions: result.actions,
      errors: result.errors,
      pageId: result.pageId,
      metadata: result.metadata,
      // Note: screenshots are not saved to JSON due to size - they would be saved separately
      screenshotCount: result.screenshots?.length || 0
    }))
  };

  writeFileSync(filePath, JSON.stringify(browserTestData, null, 2));
  console.log(`✓ Saved browser test results to ${filePath}`);

  // Save screenshots separately if they exist
  results.forEach((result, index) => {
    if (result.screenshots && result.screenshots.length > 0) {
      result.screenshots.forEach((screenshot: string, screenshotIndex: number) => {
        const screenshotFileName = `browser-test-${index}-${screenshotIndex}-${timestamp}.png`;
        const screenshotPath = join("test-results", screenshotFileName);
        
        try {
          const buffer = Buffer.from(screenshot, 'base64');
          writeFileSync(screenshotPath, buffer);
          console.log(`  ✓ Saved screenshot: ${screenshotFileName}`);
        } catch (error) {
          console.warn(`   Failed to save screenshot ${screenshotFileName}:`, error);
        }
      });
    }
  });
}