#!/usr/bin/env node

import dotenv from "dotenv";
import { InteractiveCSV } from "./interactive-cli.js";
import { safeRender, shouldUseInteractiveMode } from "./lib/ink-utils.js";
import { GitHubService } from "./github/github-service.js";
import { SandboxService } from "./lib/sandbox/index.js";
import { NUM_URLS_IN_PARALLEL } from "./consts/limits.js";
import { AIProvider, DEFAULT_PROVIDER } from "./consts/ai-providers.js";
import { saveRepositoryFiles } from "./lib/file-saver.js";
import { updateChecker } from "./lib/update-checker.js";

// Load environment variables from .env and .env.local files
// Load .env first (shared/committed config - if it exists)
dotenv.config({ path: ".env" });
// Load .env.local second (local overrides - takes precedence)
dotenv.config({ path: ".env.local" });

// Check for updates at startup (non-blocking)
updateChecker.checkForUpdates();

async function processGitHubUrlsWithGitHubAPI(
  urls: string[],
  columnName: string,
  githubToken?: string,
  aiProvider?: AIProvider
) {
  // Get max depth from environment variable, default to 5
  const maxDepth = parseInt(process.env.GITHUB_MAX_DEPTH || "5", 10);
  const githubService = new GitHubService(githubToken, undefined, maxDepth);
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
  console.log(`✓ Using parsing method: GitHub API`);

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

async function processGitHubUrlsWithE2BSandbox(
  urls: string[],
  columnName: string,
  e2bApiKey: string,
  aiProvider?: AIProvider
) {
  const sandboxService = new SandboxService({}, e2bApiKey);
  const provider = aiProvider || DEFAULT_PROVIDER;

  console.log(`✓ Using AI provider: ${provider.name}`);
  console.log(`✓ Using parsing method: E2B Sandbox`);

  console.log(`\nLoaded ${urls.length} GitHub URLs from column: ${columnName}`);
  urls.forEach((url, index) => {
    console.log(`${index + 1}. ${url}`);
  });

  if (urls.length > 0) {
    try {
      // Initialize sandbox once for all repositories
      console.log("\n" + "=".repeat(60));
      console.log("🚀 E2B SANDBOX PROCESSING MODE");
      console.log("=".repeat(60));

      await sandboxService.initialize();

      console.log("\n" + "=".repeat(60));
      console.log("📦 REPOSITORY PROCESSING");
      console.log("=".repeat(60));

      // Process URLs sequentially in sandbox (no concurrent processing needed)
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        try {
          const repoInfo = sandboxService.parseGitHubUrl(url);
          if (repoInfo) {
            const result = await sandboxService.processGitHubUrl(url, provider);
            await saveRepositoryFiles(repoInfo, result, url);
          }
        } catch (error) {
          console.error(`✗ Error processing ${url}:`, error);
        }
      }

      console.log("\n" + "=".repeat(60));
      console.log("✅ ALL REPOSITORIES PROCESSED SUCCESSFULLY!");
      console.log("=".repeat(60));
    } finally {
      // Always cleanup sandbox
      console.log("\n" + "=".repeat(60));
      console.log("🧹 SANDBOX CLEANUP");
      console.log("=".repeat(60));
      await sandboxService.cleanup();
    }
  }
}

async function processGitHubUrls(
  urls: string[],
  columnName: string,
  githubToken?: string,
  e2bApiKey?: string,
  aiProvider?: AIProvider
) {
  // Default to E2B Sandbox, fallback to GitHub API if GITHUB_API_ONLY is set or no E2B key
  const useGitHubAPI = process.env.GITHUB_API_ONLY === "true" || !e2bApiKey;

  if (useGitHubAPI) {
    await processGitHubUrlsWithGitHubAPI(
      urls,
      columnName,
      githubToken,
      aiProvider
    );
  } else {
    try {
      await processGitHubUrlsWithE2BSandbox(
        urls,
        columnName,
        e2bApiKey,
        aiProvider
      );
    } catch (error) {
      console.error("\n⚠️  E2B Sandbox processing failed:", error);
      console.log("\n🔄 Falling back to GitHub API approach...\n");

      // Fallback to GitHub API
      await processGitHubUrlsWithGitHubAPI(
        urls,
        columnName,
        githubToken,
        aiProvider
      );
    }
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
        process.env.E2B_API_KEY,
        DEFAULT_PROVIDER
      );

      // Show update notification at the end
      updateChecker.showUpdateNotificationAtExit();
    } catch (error) {
      console.error(
        "Error:",
        error instanceof Error ? error.message : String(error)
      );
      updateChecker.showUpdateNotificationAtExit();
      process.exit(1);
    }
  } else {
    // Interactive mode - check if environment supports it
    if (!shouldUseInteractiveMode()) {
      console.error(
        "\n❌ Interactive mode is not supported in this environment."
      );
      console.error("Please use command-line arguments instead:");
      console.error("   homework-grader <csv-file>");
      updateChecker.showUpdateNotificationAtExit();
      process.exit(1);
    }

    try {
      const app = await safeRender(
        <InteractiveCSV
          onComplete={async (
            filePath,
            columnName,
            urls,
            githubToken,
            e2bApiKey,
            aiProvider
          ) => {
            app.unmount();
            await processGitHubUrls(
              urls,
              columnName,
              githubToken,
              e2bApiKey,
              aiProvider
            );
            // Show update notification at the end
            updateChecker.showUpdateNotificationAtExit();
          }}
          onError={(error) => {
            app.unmount();
            console.error("Error:", error);
            updateChecker.showUpdateNotificationAtExit();
            process.exit(1);
          }}
        />
      );
    } catch (inkError) {
      // If Ink completely fails, provide fallback instructions
      console.error("\n❌ Interactive mode failed to initialize.");
      console.error(
        "   This usually happens when running in an unsupported environment."
      );
      console.error("\n💡 Fallback options:");
      console.error("   1. Use command-line mode: homework-grader <csv-file>");
      console.error("   2. Try running in a different terminal");
      console.error(
        "   3. Check if you're running inside an IDE or script environment"
      );
      console.error(
        "\n📄 For CSV processing, create a CSV file with GitHub URLs and run:"
      );
      console.error("   homework-grader your-file.csv");
      console.error(
        "\n🔗 For OAuth authentication, you can still authenticate manually by:"
      );
      console.error(
        "   • Setting environment variables (GITHUB_TOKEN, E2B_API_KEY)"
      );
      console.error("   • Running in a proper terminal environment");

      updateChecker.showUpdateNotificationAtExit();
      process.exit(1);
    }
  }
}

main().catch(console.error);
