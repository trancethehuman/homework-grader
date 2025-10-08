import { Sandbox } from "@e2b/code-interpreter";
import { v4 as uuidv4 } from "uuid";
import ms from "ms";
import {
  RepositoryInfo,
  ClonedRepository,
  RepositoryContent,
  SandboxConfig,
  FindCommandResult,
} from "./sandbox-types.js";
import { SandboxFileProcessor } from "./sandbox-file-processor.js";
import { AIProvider } from "../../consts/ai-providers.js";
import { getRepoScores } from "../../grader/grader.js";

export class SandboxService {
  private sandbox: Sandbox | null = null;
  private fileProcessor: SandboxFileProcessor;
  private clonedRepositories: ClonedRepository[] = [];
  private apiKey: string | null = null;

  constructor(private config: SandboxConfig = {}, apiKey?: string) {
    this.fileProcessor = new SandboxFileProcessor();
    this.apiKey = apiKey || process.env.E2B_API_KEY || null;
  }

  async initialize(): Promise<void> {
    if (this.sandbox) {
      console.log("ℹ Sandbox already initialized");
      return;
    }

    if (!this.apiKey) {
      throw new Error("E2B API key is required. Please provide it via constructor or E2B_API_KEY environment variable.");
    }

    console.log("🚀 Initializing E2B Sandbox...");
    console.log(
      `   Timeout: ${ms(this.config.timeout || ms("5m"), { long: true })}`
    );

    try {
      const startTime = Date.now();
      this.sandbox = await Sandbox.create({
        apiKey: this.apiKey,
        timeoutMs: this.config.timeout || ms("5m"),
      });

      const initTime = Date.now() - startTime;
      console.log(`✓ E2B Sandbox initialized successfully in ${initTime}ms`);
      console.log(`   Sandbox ID: ${this.sandbox.sandboxId || "unknown"}`);
    } catch (error: any) {
      console.error("✗ Failed to initialize E2B Sandbox:", error);
      throw error;
    }
  }

  parseGitHubUrl(url: string): RepositoryInfo | null {
    const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)/;
    const match = url.match(githubRegex);

    if (!match) {
      return null;
    }

    const owner = match[1];
    let repo = match[2];

    // Remove .git suffix if present
    if (repo.endsWith(".git")) {
      repo = repo.slice(0, -4);
    }

    // Remove any trailing slashes or additional path components
    repo = repo.split("/")[0];

    return { owner, repo, url };
  }

  async cloneRepository(
    repositoryInfo: RepositoryInfo
  ): Promise<ClonedRepository> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized. Call initialize() first.");
    }

    // Generate unique clone ID to prevent conflicts during concurrent operations
    const cloneId = uuidv4().substring(0, 8);
    const localPath = `/tmp/repos/${repositoryInfo.owner}-${repositoryInfo.repo}-${cloneId}`;

    console.log(`📦 Cloning ${repositoryInfo.owner}/${repositoryInfo.repo}...`);
    console.log(`   Source: ${repositoryInfo.url}`);
    console.log(`   Target: ${localPath}`);

    try {
      const startTime = Date.now();

      // Create the repos directory
      console.log("   Creating repository directory...");
      await this.sandbox.commands.run("mkdir -p /tmp/repos");

      // Clone the repository
      console.log("   Executing git clone (shallow)...");
      const cloneResult = await this.sandbox.commands.run(
        `git clone --depth 1 "${repositoryInfo.url}" "${localPath}"`
      );

      if (cloneResult.exitCode !== 0) {
        throw new Error(
          `Git clone failed with exit code ${cloneResult.exitCode}: ${cloneResult.stderr}`
        );
      }

      const clonedRepo: ClonedRepository = {
        info: repositoryInfo,
        localPath,
        cloneId,
      };

      this.clonedRepositories.push(clonedRepo);
      const cloneTime = Date.now() - startTime;
      console.log(
        `✓ Successfully cloned ${repositoryInfo.owner}/${repositoryInfo.repo} in ${cloneTime}ms`
      );
      console.log(`   Clone ID: ${cloneId}`);
      console.log(
        `   Total repositories cloned: ${this.clonedRepositories.length}`
      );

      return clonedRepo;
    } catch (error: any) {
      console.error(
        `✗ Failed to clone ${repositoryInfo.owner}/${repositoryInfo.repo}:`,
        error
      );
      throw error;
    }
  }

  async getRepositoryFiles(clonedRepo: ClonedRepository): Promise<string[]> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    console.log(
      `📂 Getting file list for ${clonedRepo.info.owner}/${clonedRepo.info.repo}...`
    );

    try {
      const startTime = Date.now();
      const findArgs = this.fileProcessor.buildFindCommand(
        clonedRepo.localPath
      );

      const findCommand = `find ${findArgs.join(" ")}`;
      console.log(`   Executing: ${findCommand}`);
      const result = await this.sandbox.commands.run(findCommand);

      if (result.exitCode !== 0) {
        throw new Error(
          `Find command failed with exit code ${result.exitCode}: ${result.stderr}`
        );
      }

      const stdout = result.stdout;

      // Parse the output to get file paths
      const files = stdout
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);

      const findTime = Date.now() - startTime;
      console.log(`✓ Found ${files.length} total files in ${findTime}ms`);
      return files;
    } catch (error: any) {
      console.error(
        `✗ Failed to get file list for ${clonedRepo.info.owner}/${clonedRepo.info.repo}:`,
        error
      );
      throw error;
    }
  }

  async readFileContent(filePath: string): Promise<string> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    try {
      const result = await this.sandbox.commands.run(`cat "${filePath}"`);

      if (result.exitCode !== 0) {
        console.warn(
          `Warning: Could not read file ${filePath} (exit code ${result.exitCode}):`,
          result.stderr
        );
        return "";
      }

      return result.stdout;
    } catch (error: any) {
      console.warn(`Warning: Could not read file ${filePath}:`, error);
      return "";
    }
  }

  async readFilesInParallel(files: any[], repoPath: string): Promise<void> {
    if (!this.sandbox || files.length === 0) {
      return;
    }

    const startTime = Date.now();

    // Ultra-fast approach: Use a single command to read all files at once
    if (files.length <= 100) {
      // For smaller file counts, use single command approach for maximum speed
      await this.readFilesBulk(files, repoPath);
    } else {
      // For larger repos, use parallel batches to avoid command line length limits
      const BATCH_SIZE = 20; // Smaller batches but more parallel processing
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        batchPromises.push(this.readFilesBulk(batch, repoPath));
      }

      // Process all batches in parallel for maximum speed
      await Promise.all(batchPromises);
    }

    const readTime = Date.now() - startTime;
    console.log(
      `✓ Read ${files.length} files in ${readTime}ms (${Math.round(
        files.length / (readTime / 1000)
      )} files/sec)`
    );
  }

  async readFilesBulk(files: any[], repoPath: string): Promise<void> {
    if (!this.sandbox || files.length === 0) {
      return;
    }

    try {
      // Create a shell script that reads all files and outputs them with delimiters
      const filePaths = files.map((f) => `${repoPath}/${f.path}`).join(" ");

      // Use a more efficient approach with a shell one-liner
      const scriptContent = files
        .map((file) => {
          const fullPath = `${repoPath}/${file.path}`;
          return `echo "FILE_START:${file.path}"; cat "${fullPath}" 2>/dev/null || echo ""; echo "FILE_END:${file.path}"`;
        })
        .join("; ");

      const result = await this.sandbox.commands.run(scriptContent);

      if (result.exitCode !== 0) {
        // Fallback to individual file reading if bulk fails
        console.warn("Bulk read failed, falling back to individual reads...");
        const readPromises = files.map(async (file) => {
          const fullPath = `${repoPath}/${file.path}`;
          try {
            file.content = await this.readFileContent(fullPath);
          } catch (error) {
            file.content = "";
          }
        });
        await Promise.all(readPromises);
        return;
      }

      // Parse the bulk output
      const stdout = result.stdout;
      const fileBlocks = stdout.split(/FILE_START:[^\n]*\n/);

      for (let i = 1; i < fileBlocks.length; i++) {
        const block = fileBlocks[i];
        const endMarkerIndex = block.lastIndexOf("FILE_END:");

        if (endMarkerIndex !== -1) {
          const content = block.substring(0, endMarkerIndex).trimEnd();
          const fileIndex = i - 1;
          if (fileIndex < files.length) {
            files[fileIndex].content = content;
          }
        }
      }
    } catch (error) {
      console.warn("Bulk read error, using fallback:", error);
      // Fallback to parallel individual reads
      const readPromises = files.map(async (file) => {
        const fullPath = `${repoPath}/${file.path}`;
        try {
          file.content = await this.readFileContent(fullPath);
        } catch (error) {
          file.content = "";
        }
      });
      await Promise.all(readPromises);
    }
  }

  async processRepository(
    clonedRepo: ClonedRepository
  ): Promise<RepositoryContent> {
    console.log(
      `⚙️  Processing repository ${clonedRepo.info.owner}/${clonedRepo.info.repo}...`
    );

    try {
      const startTime = Date.now();

      // Get list of files
      const fileList = await this.getRepositoryFiles(clonedRepo);

      // Filter files and create initial structure
      console.log(`🔍 Filtering files with ignore patterns...`);
      const repositoryContent = this.fileProcessor.processFileList(
        fileList,
        clonedRepo.localPath,
        clonedRepo.info
      );

      const filteredCount = repositoryContent.files.length;
      const ignoredCount = fileList.length - filteredCount;
      console.log(
        `   Kept: ${filteredCount} files, Ignored: ${ignoredCount} files`
      );

      // Read actual file contents in parallel batches for maximum speed
      console.log(
        `📖 Reading contents of ${repositoryContent.files.length} files in parallel...`
      );

      await this.readFilesInParallel(
        repositoryContent.files,
        clonedRepo.localPath
      );

      // Regenerate formatted content with actual file contents
      console.log(`📝 Generating formatted output...`);
      repositoryContent.formattedContent = this.formatRepositoryContent(
        clonedRepo.info,
        repositoryContent.files
      );

      const processTime = Date.now() - startTime;
      console.log(
        `✓ Successfully processed ${clonedRepo.info.owner}/${clonedRepo.info.repo} in ${processTime}ms - Content extraction: ${processTime}ms`
      );
      console.log(
        `   Final output: ${repositoryContent.totalFiles} files, ${repositoryContent.formattedContent.length} characters`
      );
      return repositoryContent;
    } catch (error: any) {
      console.error(
        `✗ Failed to process repository ${clonedRepo.info.owner}/${clonedRepo.info.repo}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Process a GitHub URL by cloning the repository and extracting content.
   * This method is safe for concurrent use - multiple repositories can be processed
   * in parallel as each gets a unique clone path with UUID suffix.
   */
  async processGitHubUrl(url: string, aiProvider?: AIProvider, chunkingPreference: 'allow' | 'skip' = 'allow', selectedPrompt?: string): Promise<any> {
    const repositoryInfo = this.parseGitHubUrl(url);
    if (!repositoryInfo) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }

    try {
      const totalStartTime = Date.now();

      // Clone the repository
      const clonedRepo = await this.cloneRepository(repositoryInfo);

      // Process the repository to get content
      const repositoryContent = await this.processRepository(clonedRepo);
      const contentTime = Date.now() - totalStartTime;

      // If aiProvider is provided, grade the content
      if (aiProvider) {
        const gradingStartTime = Date.now();
        console.log(
          `Grading repository ${repositoryInfo.owner}/${repositoryInfo.repo}...`
        );

        const scoresPromise = getRepoScores(
          repositoryContent.formattedContent,
          aiProvider,
          chunkingPreference,
          selectedPrompt
        )
          .then((result) => {
            const gradingTime = Date.now() - gradingStartTime;
            const totalTime = Date.now() - totalStartTime;
            console.log(
              `✓ Grading completed for ${repositoryInfo.owner}/${repositoryInfo.repo} - Grading: ${gradingTime}ms, Total: ${totalTime}ms`
            );
            return result;
          })
          .catch((error) => {
            const gradingTime = Date.now() - gradingStartTime;
            console.log(
              `✗ Grading failed for ${repositoryInfo.owner}/${repositoryInfo.repo} - Grading: ${gradingTime}ms`
            );
            throw error;
          });

        return {
          content: repositoryContent.formattedContent,
          scores: scoresPromise,
        };
      }

      const totalTime = Date.now() - totalStartTime;
      console.log(
        `✓ Repository processing completed for ${repositoryInfo.owner}/${repositoryInfo.repo} - Total: ${totalTime}ms (no grading)`
      );

      return {
        content: repositoryContent.formattedContent,
        scores: Promise.resolve({ object: null, usage: null }),
      };
    } catch (error: any) {
      console.error(`✗ Failed to process GitHub URL ${url}:`, error);
      throw error;
    }
  }

  private formatRepositoryContent(
    repositoryInfo: RepositoryInfo,
    files: any[]
  ): string {
    let content = `# Repository: ${repositoryInfo.owner}/${repositoryInfo.repo}\n\n`;
    content += `Source URL: ${repositoryInfo.url}\n\n`;
    content += `Total files processed: ${files.length}\n\n`;
    content += "---\n\n";

    for (const file of files) {
      content += `## File: ${file.path}\n\n`;
      content += "```\n";
      content += file.content;
      content += "\n```\n\n";
    }

    return content;
  }

  async cleanup(): Promise<void> {
    if (!this.sandbox) {
      console.log("ℹ No sandbox to cleanup");
      return;
    }

    const sandboxId = this.sandbox.sandboxId || "unknown";
    console.log(`🧹 Cleaning up E2B Sandbox (ID: ${sandboxId})...`);

    try {
      const startTime = Date.now();

      // Clean up cloned repositories
      if (this.clonedRepositories.length > 0) {
        console.log(
          `   Removing ${this.clonedRepositories.length} cloned repositories from /tmp/repos...`
        );
        const removeResult = await this.sandbox.commands.run("rm -rf /tmp/repos");

        if (removeResult.exitCode !== 0) {
          console.warn(
            `   Warning: Could not remove repositories (exit code ${removeResult.exitCode}): ${removeResult.stderr}`
          );
        } else {
          console.log(`   ✓ Repositories cleaned up`);
        }
      }

      // Close the sandbox
      console.log(`   Shutting down sandbox...`);
      await this.sandbox.kill();
      this.sandbox = null;
      this.clonedRepositories = [];

      const cleanupTime = Date.now() - startTime;
      console.log(
        `✓ E2B Sandbox cleaned up successfully in ${cleanupTime}ms`
      );
    } catch (error: any) {
      console.error("✗ Error during sandbox cleanup:", error);
      // Don't throw here - cleanup should be best effort
    }
  }

  async processMultipleUrls(
    urls: string[],
    aiProvider?: AIProvider,
    onProgress?: (current: number, total: number, url: string) => void
  ): Promise<any[]> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized. Call initialize() first.");
    }

    const results: any[] = [];
    const startTime = Date.now();

    console.log(
      `🔄 Processing ${urls.length} GitHub repositories using E2B Sandbox...`
    );

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const currentProgress = i + 1;

      console.log(`\n📍 Repository ${currentProgress}/${urls.length}: ${url}`);

      if (onProgress) {
        onProgress(currentProgress, urls.length, url);
      }

      try {
        const repoStartTime = Date.now();
        const result = await this.processGitHubUrl(url, aiProvider);
        const repoTime = Date.now() - repoStartTime;

        results.push({ url, success: true, result });
        console.log(
          `✅ Repository ${currentProgress} completed in ${repoTime}ms`
        );
      } catch (error: any) {
        console.error(`❌ Repository ${currentProgress} failed:`, error);
        results.push({
          url,
          success: false,
          error: error?.message || "Unknown error",
        });
      }

      // Show overall progress
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.filter((r) => !r.success).length;
      console.log(
        `📊 Progress: ${currentProgress}/${urls.length} | ✅ ${successCount} | ❌ ${failureCount}`
      );
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(`\n🏁 Batch processing completed in ${totalTime}ms`);
    console.log(`   Total repositories: ${urls.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${failureCount}`);
    console.log(
      `   Average time per repo: ${Math.round(totalTime / urls.length)}ms`
    );

    return results;
  }
}
