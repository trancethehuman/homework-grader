import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface ProcessResult {
  content: string;
  scores: Promise<any>;
}

export interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Saves repository content and scores to the test-results directory
 */
export async function saveRepositoryFiles(
  repoInfo: RepoInfo,
  result: ProcessResult,
  url: string
): Promise<void> {
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
  } catch (gradingError) {
    console.error(
      `✗ Error grading ${repoInfo.owner}/${repoInfo.repo}:`,
      gradingError
    );
    // Save an error file to track failed gradings
    const errorScores = {
      error: "Grading failed",
      message:
        gradingError instanceof Error
          ? gradingError.message
          : String(gradingError),
    };
    writeFileSync(scoresFilePath, JSON.stringify(errorScores, null, 2));
  }
}