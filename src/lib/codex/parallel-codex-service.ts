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
  type: 'initializing' | 'item_updated' | 'item_completed' | 'turn_completed';
  data?: any;
}

export class ParallelCodexService {
  private tempDir: string | null = null;
  private clonedRepos: ClonedTestRepo[] = [];
  private cloneFailures: CloneFailure[] = [];
  private urls: string[];

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
          timeout: 60000,
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
    outputSchema?: any
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
      if (onRepoStart) {
        onRepoStart({ owner: repo.owner, repo: repo.repo });
      }

      const repoStartTime = Date.now();

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

        const result = await codexService.startGrading(
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
          outputSchema
        );

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

        return gradingResult;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

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
}
