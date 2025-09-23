import { Octokit } from "@octokit/rest";
import { DEFAULT_IGNORED_EXTENSIONS } from "../consts/ignored-extensions.js";
import { getRepoScores } from "../grader/grader.js";
import { AIProvider } from "../consts/ai-providers.js";

interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

interface FileContent {
  path: string;
  content: string;
}

interface TreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface TokenValidationResult {
  valid: boolean;
  error?: string;
  rateLimit?: {
    remaining: number;
    reset: number;
  };
}

interface RateLimitInfo {
  remaining: number;
  reset: number;
  used: number;
  limit: number;
}

export class GitHubService {
  private octokit: Octokit;
  private ignoredExtensions: Set<string>;
  private maxDepth: number;

  constructor(token?: string, ignoredExtensions?: string[], maxDepth: number = 5) {
    this.octokit = new Octokit({
      auth: token,
    });

    this.ignoredExtensions = new Set([
      ...DEFAULT_IGNORED_EXTENSIONS,
      ...(ignoredExtensions || []),
    ]);
    
    this.maxDepth = maxDepth;
  }

  addIgnoredExtensions(extensions: string[]): void {
    extensions.forEach((ext) => this.ignoredExtensions.add(ext.toLowerCase()));
  }

  removeIgnoredExtensions(extensions: string[]): void {
    extensions.forEach((ext) =>
      this.ignoredExtensions.delete(ext.toLowerCase())
    );
  }

  getIgnoredExtensions(): string[] {
    return Array.from(this.ignoredExtensions).sort();
  }

  setMaxDepth(depth: number): void {
    this.maxDepth = Math.max(1, depth); // Ensure minimum depth of 1
  }

  getMaxDepth(): number {
    return this.maxDepth;
  }

  /**
   * Validates the GitHub token and returns rate limit information
   */
  async validateToken(): Promise<TokenValidationResult> {
    try {
      const response = await this.octokit.rest.users.getAuthenticated();
      const rateLimitResponse = await this.octokit.rest.rateLimit.get();

      return {
        valid: true,
        rateLimit: {
          remaining: rateLimitResponse.data.rate.remaining,
          reset: rateLimitResponse.data.rate.reset,
        },
      };
    } catch (error: any) {
      // Provide specific error messages based on the actual error
      if (error.status === 401) {
        return {
          valid: false,
          error: "Invalid token: The token is malformed, expired, or revoked. Please check your token and try again.",
        };
      } else if (error.status === 403) {
        // Parse the error message to provide more specific guidance
        const errorMessage = error.message || '';
        const errorResponse = error.response?.data?.message || '';
        
        if (errorMessage.includes('rate limit') || errorResponse.includes('rate limit')) {
          return {
            valid: false,
            error: "Rate limit exceeded: Too many requests. Please wait and try again later.",
          };
        } else if (errorMessage.includes('scope') || errorResponse.includes('scope')) {
          return {
            valid: false,
            error: "Insufficient permissions: Token needs 'repo' scope to access repository contents. Please update your token permissions.",
          };
        } else if (errorMessage.includes('suspended') || errorResponse.includes('suspended')) {
          return {
            valid: false,
            error: "Account suspended: Your GitHub account or token has been suspended.",
          };
        } else {
          return {
            valid: false,
            error: `Access forbidden: ${errorResponse || errorMessage || 'The token may lack required permissions or the resource is restricted.'}`,
          };
        }
      } else if (error.status === 404) {
        return {
          valid: false,
          error: "Resource not found: Unable to validate token. The GitHub API endpoint may be unavailable.",
        };
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return {
          valid: false,
          error: "Network error: Unable to connect to GitHub. Please check your internet connection.",
        };
      } else if (error.code === 'ETIMEDOUT') {
        return {
          valid: false,
          error: "Request timeout: GitHub API is taking too long to respond. Please try again.",
        };
      } else {
        return {
          valid: false,
          error: `Token validation failed: ${error.message || 'Unknown error occurred'}`,
        };
      }
    }
  }

  /**
   * Gets current rate limit information
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      return {
        remaining: response.data.rate.remaining,
        reset: response.data.rate.reset,
        used: response.data.rate.used,
        limit: response.data.rate.limit,
      };
    } catch (error: any) {
      throw new Error(`Failed to get rate limit: ${error.message}`);
    }
  }

  /**
   * Sleeps until rate limit resets
   */
  private async waitForRateLimit(resetTime: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const waitTime = (resetTime - now + 1) * 1000; // Add 1 second buffer

    if (waitTime > 0) {
      console.log(
        `Rate limit hit. Waiting ${Math.ceil(waitTime / 1000)} seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Executes a GitHub API call with rate limit handling
   */
  private async executeWithRateLimit<T>(apiCall: () => Promise<T>): Promise<T> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        return await apiCall();
      } catch (error: any) {
        if (error.status === 403 && error.message.includes("rate limit")) {
          const resetTime = error.response?.headers?.["x-ratelimit-reset"];
          if (resetTime) {
            await this.waitForRateLimit(parseInt(resetTime));
            attempt++;
            continue;
          }
        }
        throw error;
      }
    }

    throw new Error("Max retries exceeded for rate limit");
  }

  private shouldIgnoreFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const fileName = lowerPath.substring(lowerPath.lastIndexOf("/") + 1);
    const extension = lowerPath.substring(lowerPath.lastIndexOf("."));
    
    // Check depth limit
    const pathDepth = filePath.split("/").length;
    if (pathDepth > this.maxDepth) {
      return true;
    }
    
    // Check if the full filename is in the ignored list
    if (this.ignoredExtensions.has(fileName)) {
      return true;
    }
    
    // Check if any directory in the path is ignored
    const pathParts = lowerPath.split("/");
    for (const part of pathParts) {
      if (this.ignoredExtensions.has(part)) {
        return true;
      }
    }
    
    // Check file extension
    if (extension && this.ignoredExtensions.has(extension)) {
      return true;
    }
    
    // Check for snapshot files specifically
    if (lowerPath.includes("__snapshots__") || lowerPath.endsWith(".snap")) {
      return true;
    }
    
    return false;
  }

  parseGitHubUrl(url: string): GitHubRepoInfo | null {
    const githubUrlRegex =
      /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/;
    const match = url.match(githubUrlRegex);

    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""),
    };
  }

  async getAllFiles(owner: string, repo: string): Promise<FileContent[]> {
    const files: FileContent[] = [];

    try {
      // Get the repository's default branch with rate limit handling
      const repoResponse = await this.executeWithRateLimit(() =>
        this.octokit.rest.repos.get({ owner, repo })
      );
      const defaultBranch = repoResponse.data.default_branch;

      // Get the tree for the entire repository in one API call
      const treeResponse = await this.executeWithRateLimit(() =>
        this.octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: defaultBranch,
          recursive: "true",
        })
      );

      const allFiles = treeResponse.data.tree.filter(item => item.type === "blob" && item.path);
      const totalFiles = allFiles.length;
      
      const treeItems: TreeItem[] = allFiles
        .filter(item => !this.shouldIgnoreFile(item.path!))
        .map((item) => ({
          path: item.path!,
          type: item.type as "blob",
          sha: item.sha!,
          size: item.size,
        }));

      const filteredFiles = treeItems.length;
      const skippedFiles = totalFiles - filteredFiles;
      
      console.log(`📁 Repository scan complete:`);
      console.log(`   • Total files found: ${totalFiles}`);
      console.log(`   • Files to process: ${filteredFiles}`);
      console.log(`   • Files skipped: ${skippedFiles} (depth limit: ${this.maxDepth})`);
      
      if (skippedFiles > 0) {
        const depthFiltered = allFiles.filter(item => {
          const depth = item.path!.split("/").length;
          return depth > this.maxDepth;
        }).length;
        if (depthFiltered > 0) {
          console.log(`   • Files skipped due to depth (>${this.maxDepth}): ${depthFiltered}`);
        }
      }

      // Process files in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < treeItems.length; i += batchSize) {
        const batch = treeItems.slice(i, i + batchSize);
        const batchPromises = batch.map(async (item) => {
          const content = await this.getFileContentByHash(
            owner,
            repo,
            item.sha
          );
          if (content) {
            return {
              path: item.path,
              content,
            };
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        const validFiles = batchResults.filter(
          (file) => file !== null
        ) as FileContent[];
        files.push(...validFiles);

        // Add a small delay between batches to be respectful to the API
        if (i + batchSize < treeItems.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error: any) {
      if (error.status === 401) {
        throw new Error(
          "GitHub token is invalid or expired. Please provide a valid token."
        );
      } else if (error.status === 403) {
        throw new Error(
          "GitHub token lacks required permissions or rate limit exceeded."
        );
      } else if (error.status === 404) {
        throw new Error(
          `Repository ${owner}/${repo} not found or not accessible.`
        );
      } else {
        console.error(`Error fetching files from ${owner}/${repo}:`, error);
        throw error;
      }
    }

    return files;
  }

  private async getFileContentByHash(
    owner: string,
    repo: string,
    sha: string
  ): Promise<string | null> {
    try {
      const response = await this.executeWithRateLimit(() =>
        this.octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: sha,
        })
      );

      if (response.data.content && response.data.encoding === "base64") {
        return Buffer.from(response.data.content, "base64").toString("utf-8");
      }

      return null;
    } catch (error) {
      console.error(`Error fetching blob ${sha}:`, error);
      return null;
    }
  }

  async processGitHubUrl(
    url: string,
    provider: AIProvider,
    chunkingPreference: 'allow' | 'skip' = 'allow',
    selectedPrompt?: string
  ): Promise<{ content: string; scores: Promise<any> }> {
    const totalStartTime = Date.now();
    const repoInfo = this.parseGitHubUrl(url);
    if (!repoInfo) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }

    const files = await this.getAllFiles(repoInfo.owner, repoInfo.repo);

    let concatenatedContent = `# Repository: ${repoInfo.owner}/${repoInfo.repo}\n\n`;
    concatenatedContent += `Source URL: ${url}\n\n`;
    concatenatedContent += `Total files processed: ${files.length}\n\n`;
    concatenatedContent += "---\n\n";

    for (const file of files) {
      concatenatedContent += `## File: ${file.path}\n\n`;
      concatenatedContent += "```\n";
      concatenatedContent += file.content;
      concatenatedContent += "\n```\n\n";
    }

    const contentTime = Date.now() - totalStartTime;
    console.log(`✓ Successfully processed ${repoInfo.owner}/${repoInfo.repo} via GitHub API - Content extraction: ${contentTime}ms`);

    const gradingStartTime = Date.now();
    const scoresPromise = getRepoScores(concatenatedContent, provider, chunkingPreference, selectedPrompt).then(result => {
      const gradingTime = Date.now() - gradingStartTime;
      const totalTime = Date.now() - totalStartTime;
      console.log(`✓ Grading completed for ${repoInfo.owner}/${repoInfo.repo} - Grading: ${gradingTime}ms, Total: ${totalTime}ms`);
      return result;
    }).catch(error => {
      const gradingTime = Date.now() - gradingStartTime;
      console.log(`✗ Grading failed for ${repoInfo.owner}/${repoInfo.repo} - Grading: ${gradingTime}ms`);
      throw error;
    });

    return { content: concatenatedContent, scores: scoresPromise };
  }
}
