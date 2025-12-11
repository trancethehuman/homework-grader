import { Octokit } from "@octokit/rest";
import { DEFAULT_IGNORED_EXTENSIONS } from "../consts/ignored-extensions.js";
import { getRepoScores } from "../grader/grader.js";
import { AIProvider } from "../consts/ai-providers.js";
import { RateLimiter } from "../lib/utils/rate-limiter.js";
import { GitHubUrlParser, GitHubRepoInfo } from "../lib/github/github-url-parser.js";
import { GitHubRateLimiter } from "../lib/github/github-rate-limiter.js";
import {
  checkBulkOperationQuota,
  RateLimitCheckResult,
} from "../lib/github/rate-limit-checker.js";

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

export interface GitHubRepoResult {
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  private: boolean;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface AddCollaboratorResult {
  username: string;
  success: boolean;
  error?: string;
  invitationId?: number;
  status?: "invited" | "already_collaborator";
}

export interface CreateIssueResult {
  success: boolean;
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}

export class GitHubService {
  private octokit: Octokit;
  private ignoredExtensions: Set<string>;
  private maxDepth: number;
  private collaboratorRateLimiter: GitHubRateLimiter;

  constructor(token?: string, ignoredExtensions?: string[], maxDepth: number = 5) {
    this.octokit = new Octokit({
      auth: token,
    });
    this.collaboratorRateLimiter = new GitHubRateLimiter();

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
   * Checks if there is sufficient rate limit quota for a bulk operation
   */
  async checkRateLimitForBulkOperation(
    operationCount: number
  ): Promise<RateLimitCheckResult> {
    const rateLimit = await this.getRateLimit();
    return checkBulkOperationQuota(rateLimit, operationCount);
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
    return GitHubUrlParser.parse(url);
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
    selectedPrompt?: string,
    rateLimiter?: RateLimiter
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
    const scoresPromise = getRepoScores(concatenatedContent, provider, chunkingPreference, selectedPrompt, rateLimiter).then(result => {
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

  /**
   * Gets the authenticated user's information
   */
  async getAuthenticatedUser(): Promise<{ login: string; name: string | null; avatar_url: string }> {
    const response = await this.executeWithRateLimit(() =>
      this.octokit.rest.users.getAuthenticated()
    );
    return {
      login: response.data.login,
      name: response.data.name,
      avatar_url: response.data.avatar_url,
    };
  }

  /**
   * Lists repositories the authenticated user has access to
   */
  async listUserRepositories(perPage: number = 20): Promise<GitHubRepoResult[]> {
    const response = await this.executeWithRateLimit(() =>
      this.octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        sort: "updated",
        affiliation: "owner,collaborator,organization_member",
      })
    );

    return response.data.map((repo) => ({
      owner: repo.owner?.login || "",
      repo: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      permissions: {
        admin: repo.permissions?.admin || false,
        push: repo.permissions?.push || false,
        pull: repo.permissions?.pull || false,
      },
    }));
  }

  /**
   * Searches repositories the user has access to
   */
  async searchRepositories(query: string, perPage: number = 20): Promise<GitHubRepoResult[]> {
    if (!query.trim()) {
      return this.listUserRepositories(perPage);
    }

    const response = await this.executeWithRateLimit(() =>
      this.octokit.rest.search.repos({
        q: query,
        per_page: perPage,
        sort: "updated",
      })
    );

    return response.data.items.map((repo) => ({
      owner: repo.owner?.login || "",
      repo: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      permissions: {
        admin: repo.permissions?.admin || false,
        push: repo.permissions?.push || false,
        pull: repo.permissions?.pull || false,
      },
    }));
  }

  /**
   * Adds a collaborator to a repository with read (pull) permission
   * Uses rate limiting with exponential backoff for secondary rate limits
   */
  async addCollaborator(
    owner: string,
    repo: string,
    username: string
  ): Promise<AddCollaboratorResult> {
    try {
      const response = await this.collaboratorRateLimiter.executeWithRetry(
        () =>
          this.octokit.rest.repos.addCollaborator({
            owner,
            repo,
            username,
            permission: "pull",
          }),
        { maxRetries: 5 },
        true
      );

      return {
        username,
        success: true,
        invitationId: response.data?.id,
        status: response.status === 201 ? "invited" : "already_collaborator",
      };
    } catch (error: any) {
      let errorMessage = error.message || "Unknown error";

      if (error.status === 404) {
        errorMessage = "User not found or repository not accessible";
      } else if (error.status === 403) {
        if (
          error.message?.toLowerCase().includes("rate limit") ||
          error.message?.toLowerCase().includes("secondary")
        ) {
          errorMessage = "Rate limit exceeded - please try again later";
        } else {
          errorMessage =
            "Permission denied - you need admin access to this repository";
        }
      } else if (error.status === 429) {
        errorMessage = "Too many requests - rate limit exceeded";
      } else if (error.status === 422) {
        if (error.message?.includes("already")) {
          return {
            username,
            success: true,
            status: "already_collaborator",
          };
        }
        errorMessage = error.message || "Validation failed";
      }

      return {
        username,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Batch adds collaborators with progress callback
   * Rate limiting and throttling is handled by the GitHubRateLimiter
   */
  async addCollaboratorsBatch(
    owner: string,
    repo: string,
    usernames: string[],
    onProgress?: (current: number, total: number, result: AddCollaboratorResult) => void,
    abortSignal?: AbortSignal
  ): Promise<AddCollaboratorResult[]> {
    const results: AddCollaboratorResult[] = [];

    for (let i = 0; i < usernames.length; i++) {
      if (abortSignal?.aborted) {
        for (let j = i; j < usernames.length; j++) {
          results.push({
            username: usernames[j].trim(),
            success: false,
            error: "Aborted by user",
          });
        }
        break;
      }

      const username = usernames[i].trim();
      if (!username) continue;

      const result = await this.addCollaborator(owner, repo, username);
      results.push(result);

      onProgress?.(i + 1, usernames.length, result);
    }

    return results;
  }

  async checkWriteAccess(owner: string, repo: string): Promise<boolean> {
    try {
      const response = await this.executeWithRateLimit(() =>
        this.octokit.rest.repos.get({ owner, repo })
      );
      return response.data.permissions?.push || false;
    } catch (error: any) {
      if (error.status === 404 || error.status === 403) {
        return false;
      }
      throw error;
    }
  }

  async createIssue(
    owner: string,
    repo: string,
    title: string,
    body: string
  ): Promise<CreateIssueResult> {
    try {
      await this.collaboratorRateLimiter.executeWithRetry(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return { data: null, status: 200, headers: {}, url: "" };
        },
        { maxRetries: 1 },
        true
      );

      const response = await this.collaboratorRateLimiter.executeWithRetry(
        () =>
          this.octokit.rest.issues.create({
            owner,
            repo,
            title,
            body,
          }),
        { maxRetries: 5 },
        true
      );

      return {
        success: true,
        issueNumber: response.data.number,
        issueUrl: response.data.html_url,
      };
    } catch (error: any) {
      let errorMessage = error.message || "Unknown error";

      if (error.status === 404) {
        errorMessage = "Repository not found or not accessible";
      } else if (error.status === 403) {
        if (
          error.message?.toLowerCase().includes("rate limit") ||
          error.message?.toLowerCase().includes("secondary")
        ) {
          errorMessage = "Rate limit exceeded - please try again later";
        } else {
          errorMessage = "Permission denied - you need write access to create issues";
        }
      } else if (error.status === 410) {
        errorMessage = "Issues are disabled for this repository";
      } else if (error.status === 422) {
        errorMessage = "Validation failed - invalid title or body";
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
