import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { CodexService } from "./codex-service.js";
import {
  ClonedTestRepo,
  CloneFailure,
  CloneResults,
  ParallelGradingResult,
  ParallelTestResults,
  ThreadItem,
  Usage,
} from "./codex-types.js";

export interface RepoEventData {
  type: 'initializing' | 'item_updated' | 'item_completed' | 'turn_completed' | 'error';
  data?: any;
}

export class ParallelCodexService {
  private tempDir: string | null = null;
  private clonedRepos: ClonedTestRepo[] = [];
  private cloneFailures: CloneFailure[] = [];
  private urls: string[];
  private abortController = new AbortController();
  private repoAbortControllers = new Map<string, AbortController>();

  constructor(urls: string[]) {
    if (!urls || urls.length === 0) {
      throw new Error("At least one repository URL is required");
    }
    this.urls = urls;
  }

  private parseGitHubUrl(url: string): { owner: string; repo: string } {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""),
    };
  }

  async cloneRepositories(
    onProgress?: (message: string, repoIndex: number, total: number) => void
  ): Promise<CloneResults> {
    const tempDirBase = os.tmpdir();
    this.tempDir = path.join(tempDirBase, `codex-parallel-batch-${uuidv4()}`);

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const clonedRepos: ClonedTestRepo[] = [];
    const failures: CloneFailure[] = [];

    for (let i = 0; i < this.urls.length; i++) {
      const url = this.urls[i];

      try {
        const { owner, repo } = this.parseGitHubUrl(url);

        if (onProgress) {
          onProgress(
            `Cloning ${owner}/${repo}...`,
            i + 1,
            this.urls.length
          );
        }

        const localPath = path.join(this.tempDir, `${owner}-${repo}`);

        execSync(`git clone --depth 1 ${url} ${localPath}`, {
          stdio: "pipe",
          timeout: 300000,
        });

        clonedRepos.push({
          url,
          owner,
          repo,
          localPath,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        const owner = match?.[1] || "unknown";
        const repo = match?.[2]?.replace(/\.git$/, "") || "unknown";

        console.warn(`⚠️  Failed to clone ${owner}/${repo}: ${errorMessage}`);

        failures.push({
          url,
          owner,
          repo,
          error: errorMessage,
        });
      }
    }

    this.clonedRepos = clonedRepos;
    this.cloneFailures = failures;

    return {
      successful: clonedRepos,
      failed: failures,
    };
  }

  async runParallelGrading(
    prompt: string,
    onRepoStart?: (repoInfo: { owner: string; repo: string }) => void,
    onRepoComplete?: (result: ParallelGradingResult) => void,
    onRepoEvent?: (repoInfo: { owner: string; repo: string }, event: RepoEventData) => void,
    useStructuredOutput: boolean = true
  ): Promise<ParallelTestResults> {
    const totalStartTime = Date.now();

    if (this.clonedRepos.length === 0) {
      console.warn("⚠️  No repositories successfully cloned. Skipping grading phase.");
      return {
        results: [],
        cloneFailures: this.cloneFailures,
        totalDuration: Date.now() - totalStartTime,
        successCount: 0,
        failureCount: 0,
      };
    }

    const gradingPromises = this.clonedRepos.map(async (repo) => {
      const repoKey = `${repo.owner}/${repo.repo}`;
      const repoAbortController = new AbortController();
      this.repoAbortControllers.set(repoKey, repoAbortController);

      if (this.abortController.signal.aborted || repoAbortController.signal.aborted) {
        const errorMessage = this.abortController.signal.aborted
          ? "Aborted by user"
          : "Skipped by user";
        return {
          success: false,
          error: errorMessage,
          repoInfo: {
            url: repo.url,
            owner: repo.owner,
            repo: repo.repo,
          },
          duration: 0,
        } as ParallelGradingResult;
      }

      if (onRepoStart) {
        onRepoStart({ owner: repo.owner, repo: repo.repo });
      }

      const repoStartTime = Date.now();

      // Increased timeout to 10 minutes for complex repositories
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Processing timeout (10 minutes)')), 600000)
      );

      try {
        if (onRepoEvent) {
          onRepoEvent(
            { owner: repo.owner, repo: repo.repo },
            { type: 'initializing' }
          );
        }

        const codexService = new CodexService({
          repoPath: repo.localPath,
          skipGitRepoCheck: false,
        });

        const gradingPromise = codexService.startGrading(
          prompt,
          {
            onItemUpdated: (item: ThreadItem) => {
              if (onRepoEvent) {
                onRepoEvent(
                  { owner: repo.owner, repo: repo.repo },
                  { type: 'item_updated', data: item }
                );
              }
            },
            onItemCompleted: (item: ThreadItem) => {
              if (onRepoEvent) {
                onRepoEvent(
                  { owner: repo.owner, repo: repo.repo },
                  { type: 'item_completed', data: item }
                );
              }
            },
            onTurnCompleted: (usage: Usage) => {
              if (onRepoEvent) {
                onRepoEvent(
                  { owner: repo.owner, repo: repo.repo },
                  { type: 'turn_completed', data: usage }
                );
              }
            },
          },
          useStructuredOutput
        );

        const result = await Promise.race([gradingPromise, timeoutPromise]);

        const duration = Date.now() - repoStartTime;

        const gradingResult: ParallelGradingResult = {
          ...result,
          repoInfo: {
            url: repo.url,
            owner: repo.owner,
            repo: repo.repo,
          },
          duration,
        };

        if (onRepoComplete) {
          onRepoComplete(gradingResult);
        }

        try {
          if (fs.existsSync(repo.localPath)) {
            fs.rmSync(repo.localPath, { recursive: true, force: true });
            console.log(`🗑️  Cleaned up ${repo.owner}/${repo.repo}`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup ${repo.owner}/${repo.repo}:`, cleanupError);
        }

        return gradingResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        if (onRepoEvent) {
          onRepoEvent(
            { owner: repo.owner, repo: repo.repo },
            { type: 'error', data: errorMessage }
          );
        }

        const duration = Date.now() - repoStartTime;

        const gradingResult: ParallelGradingResult = {
          success: false,
          error: errorMessage,
          repoInfo: {
            url: repo.url,
            owner: repo.owner,
            repo: repo.repo,
          },
          duration,
        };

        if (onRepoComplete) {
          onRepoComplete(gradingResult);
        }

        try {
          if (fs.existsSync(repo.localPath)) {
            fs.rmSync(repo.localPath, { recursive: true, force: true });
            console.log(`🗑️  Cleaned up ${repo.owner}/${repo.repo} (after error)`);
          }
        } catch (cleanupError) {
          console.warn(`⚠️  Failed to cleanup ${repo.owner}/${repo.repo}:`, cleanupError);
        }

        return gradingResult;
      }
    });

    const results = await Promise.all(gradingPromises);
    const totalDuration = Date.now() - totalStartTime;

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return {
      results,
      cloneFailures: this.cloneFailures,
      totalDuration,
      successCount,
      failureCount,
    };
  }

  cleanup(): void {
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
        console.log(`🗑️  Cleaned up temp directory`);
      } catch (error) {
        console.error(`Failed to cleanup temp directory: ${error}`);
      }
    }
  }

  getTempDir(): string | null {
    return this.tempDir;
  }

  getUrls(): string[] {
    return this.urls;
  }

  abort(): void {
    this.abortController.abort();
    console.log("⚠️  Abort signal sent to parallel grading");
  }

  skipRepo(owner: string, repo: string): void {
    const repoKey = `${owner}/${repo}`;
    const controller = this.repoAbortControllers.get(repoKey);
    if (controller) {
      controller.abort();
      console.log(`⏭️  Skip signal sent to ${owner}/${repo}`);
    }
  }

  stopRepo(owner: string, repo: string): void {
    const repoKey = `${owner}/${repo}`;
    const controller = this.repoAbortControllers.get(repoKey);
    if (controller) {
      controller.abort();
      console.log(`🛑  Stop signal sent to ${owner}/${repo}`);
    }
  }
}
