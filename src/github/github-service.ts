import { Octokit } from "@octokit/rest";
import { DEFAULT_IGNORED_EXTENSIONS } from "../consts/ignored-extensions.js";

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

  constructor(token?: string, ignoredExtensions?: string[]) {
    this.octokit = new Octokit({
      auth: token,
    });

    this.ignoredExtensions = new Set([
      ...DEFAULT_IGNORED_EXTENSIONS,
      ...(ignoredExtensions || []),
    ]);
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
      if (error.status === 401) {
        return {
          valid: false,
          error: "Token is invalid or expired",
        };
      } else if (error.status === 403) {
        return {
          valid: false,
          error: "Token lacks required permissions (needs repo scope)",
        };
      } else {
        return {
          valid: false,
          error: `Token validation failed: ${error.message}`,
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
    const extension = filePath
      .toLowerCase()
      .substring(filePath.lastIndexOf("."));
    return this.ignoredExtensions.has(extension);
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

      const treeItems: TreeItem[] = treeResponse.data.tree
        .filter(
          (item) =>
            item.type === "blob" &&
            item.path &&
            !this.shouldIgnoreFile(item.path)
        )
        .map((item) => ({
          path: item.path!,
          type: item.type as "blob",
          sha: item.sha!,
          size: item.size,
        }));

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

  async processGitHubUrl(url: string): Promise<string> {
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

    return concatenatedContent;
  }
}
