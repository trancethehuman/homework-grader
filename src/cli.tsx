#!/usr/bin/env node

import { render } from "ink";
import { InteractiveCSV } from "./interactive-csv.js";
import { GitHubService } from "./github/github-service.js";
import { NUM_URLS_IN_PARALLEL } from "./consts/limits.js";
import { AIProvider, DEFAULT_PROVIDER } from "./consts/ai-providers.js";
import { saveRepositoryFiles } from "./lib/file-saver.js";

async function processGitHubUrls(
  urls: string[],
  columnName: string,
  githubToken?: string,
  aiProvider?: AIProvider
) {
  const githubService = new GitHubService(githubToken);
  const provider = aiProvider || DEFAULT_PROVIDER;

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

  console.log(`✓ Using AI provider: ${provider.name}`);

  console.log(`\nLoaded ${urls.length} GitHub URLs from column: ${columnName}`);
  urls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
  });

  if (urls.length > 0) {
    console.log("\nProcessing GitHub repositories...");

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
          const result = await githubService.processGitHubUrl(url, provider);
          
          await saveRepositoryFiles(repoInfo, result, url);
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
  // Clear the terminal on startup
  console.clear();
  
  const args = process.argv.slice(2);


  // Check if a CSV file was provided as argument (legacy mode)
  if (args.length > 0 && !args[0].startsWith("--")) {
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
        process.env.GITHUB_TOKEN,
        DEFAULT_PROVIDER
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
        onComplete={async (filePath, columnName, urls, githubToken, aiProvider) => {
          app.unmount();
          await processGitHubUrls(urls, columnName, githubToken, aiProvider);
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
