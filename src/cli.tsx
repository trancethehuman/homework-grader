#!/usr/bin/env node

import { render } from "ink";
import { InteractiveCSV } from "./interactive-csv.js";
import { GitHubService } from "./github/github-service.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { NUM_URLS_IN_PARALLEL } from "./consts/limits.js";

async function processGitHubUrls(
  urls: string[],
  columnName: string,
  githubToken?: string
) {
  const githubService = new GitHubService(githubToken);

  // Display authentication status
  if (githubToken) {
    console.log(
      `✓ Using GitHub token for authentication (5,000 requests/hour)`
    );
  } else {
    console.log(
      `⚠ No GitHub token provided. Using unauthenticated requests (60 requests/hour)`
    );
    console.log(
      `  To avoid rate limiting, set GITHUB_TOKEN environment variable or provide token interactively`
    );
  }

  console.log(`\nLoaded ${urls.length} GitHub URLs from column: ${columnName}`);
  urls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
  });

  if (urls.length > 0) {
    console.log("\nProcessing GitHub repositories...");

    // Ensure test-results directory exists
    try {
      mkdirSync("test-results", { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Process URLs concurrently with a limit of 10

    const processUrl = async (url: string, index: number) => {
      console.log(
        `\nProcessing GitHub URL ${index + 1}/${urls.length}: ${url}`
      );

      try {
        const repoInfo = githubService.parseGitHubUrl(url);
        if (repoInfo) {
          console.log(
            `Fetching repository structure from ${repoInfo.owner}/${repoInfo.repo}...`
          );
          const result = await githubService.processGitHubUrl(url);
          
          const fileName = `${repoInfo.owner}-${repoInfo.repo}.md`;
          const filePath = join("test-results", fileName);
          
          const scoresFileName = `${repoInfo.owner}-${repoInfo.repo}-scores.json`;
          const scoresFilePath = join("test-results", scoresFileName);

          // Save content immediately when available
          writeFileSync(filePath, result.content);
          console.log(`✓ Saved content to ${filePath}`);
          
          // Grade in parallel - content is already saved
          console.log(
            `Grading repository ${repoInfo.owner}/${repoInfo.repo}...`
          );
          
          try {
            const scores = await result.scores;
            writeFileSync(scoresFilePath, JSON.stringify(scores, null, 2));
            console.log(`✓ Saved scores to ${scoresFilePath}`);
          } catch (gradingError) {
            console.error(`✗ Error grading ${repoInfo.owner}/${repoInfo.repo}:`, gradingError);
            // Save an error file to track failed gradings
            const errorScores = {
              error: "Grading failed",
              message: gradingError instanceof Error ? gradingError.message : String(gradingError)
            };
            writeFileSync(scoresFilePath, JSON.stringify(errorScores, null, 2));
          }
        }
      } catch (error) {
        console.error(`✗ Error processing ${url}:`, error);
      }
    };

    // Process URLs in batches of up to 10 concurrent requests
    for (let i = 0; i < urls.length; i += NUM_URLS_IN_PARALLEL) {
      const batch = urls.slice(i, i + NUM_URLS_IN_PARALLEL);
      const batchPromises = batch.map((url, batchIndex) =>
        processUrl(url, i + batchIndex)
      );

      await Promise.all(batchPromises);

      // Add a small delay between batches to be respectful to GitHub API
      if (i + NUM_URLS_IN_PARALLEL < urls.length) {
        console.log(
          `\nCompleted batch ${
            Math.floor(i / NUM_URLS_IN_PARALLEL) + 1
          }. Pausing briefly before next batch...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log("\nAll GitHub URLs processed successfully!");
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Check if a CSV file was provided as argument (legacy mode)
  if (args.length > 0) {
    const { URLLoader } = await import("./url-loader.js");
    const csvFilePath = args[0];
    const loader = new URLLoader();

    try {
      console.log(`Loading URLs from: ${csvFilePath}`);
      const urls = await loader.loadFromCSV(csvFilePath);
      const githubUrls = urls.filter((url: string) =>
        url.includes("github.com")
      );
      await processGitHubUrls(
        githubUrls,
        "auto-detected",
        process.env.GITHUB_TOKEN
      );
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  } else {
    // Interactive mode
    const app = render(
      <InteractiveCSV
        onComplete={async (filePath, columnName, urls, githubToken) => {
          app.unmount();
          await processGitHubUrls(urls, columnName, githubToken);
        }}
        onError={(error) => {
          app.unmount();
          console.error("Error:", error);
          process.exit(1);
        }}
      />
    );
  }
}

main().catch(console.error);
