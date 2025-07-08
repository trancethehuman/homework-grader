#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { InteractiveCSV } from "./interactive-csv.js";
import { GitHubService } from "./github/github-service.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

async function processGitHubUrls(urls: string[], columnName: string) {
  const githubService = new GitHubService();

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

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\nProcessing GitHub URL ${i + 1}/${urls.length}: ${url}`);

      try {
        const repoInfo = githubService.parseGitHubUrl(url);
        if (repoInfo) {
          console.log(
            `Fetching files from ${repoInfo.owner}/${repoInfo.repo}...`
          );
          const concatenatedContent = await githubService.processGitHubUrl(url);

          const fileName = `${repoInfo.owner}-${repoInfo.repo}.md`;
          const filePath = join("test-results", fileName);

          writeFileSync(filePath, concatenatedContent);
          console.log(`✓ Saved to ${filePath}`);
        }
      } catch (error) {
        console.error(`✗ Error processing ${url}:`, error);
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
      await processGitHubUrls(githubUrls, "auto-detected");
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
        onComplete={async (filePath, columnName, urls) => {
          app.unmount();
          await processGitHubUrls(urls, columnName);
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
