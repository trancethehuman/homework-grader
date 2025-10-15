import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { v4 as uuidv4 } from "uuid";
import { CodexService } from "./codex-service.js";
import {
  ClonedTestRepo,
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
  private repoCount: number;

  private readonly TEST_REPOS = [
    "https://github.com/microsoft/amplifier",
    "https://github.com/karpathy/nanochat",
    "https://github.com/obra/superpowers",
    "https://github.com/electron/electron",
    "https://github.com/vercel/next.js",
    "https://github.com/facebook/react",
    "https://github.com/microsoft/vscode",
    "https://github.com/denoland/deno",
    "https://github.com/nodejs/node",
    "https://github.com/vuejs/vue",
    "https://github.com/sveltejs/svelte",
    "https://github.com/angular/angular",
    "https://github.com/tailwindlabs/tailwindcss",
    "https://github.com/vitejs/vite",
    "https://github.com/webpack/webpack",
    "https://github.com/expressjs/express",
    "https://github.com/nestjs/nest",
    "https://github.com/trpc/trpc",
    "https://github.com/prisma/prisma",
    "https://github.com/supabase/supabase",
  ];

  constructor(count: number = 4) {
    this.repoCount = Math.max(1, count);
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
  ): Promise<ClonedTestRepo[]> {
    const tempDirBase = os.tmpdir();
    this.tempDir = path.join(tempDirBase, `codex-parallel-test-${uuidv4()}`);

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const clonedRepos: ClonedTestRepo[] = [];

    for (let i = 0; i < this.repoCount; i++) {
      const url = this.TEST_REPOS[i % this.TEST_REPOS.length];
      const { owner, repo } = this.parseGitHubUrl(url);

      if (onProgress) {
        onProgress(
          `Cloning ${owner}/${repo}...`,
          i + 1,
          this.repoCount
        );
      }

      const localPath = path.join(this.tempDir, repo);

      try {
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
        throw new Error(
          `Failed to clone ${owner}/${repo}: ${errorMessage}`
        );
      }
    }

    this.clonedRepos = clonedRepos;
    return clonedRepos;
  }

  async runParallelGrading(
    prompt: string,
    onRepoStart?: (repoInfo: { owner: string; repo: string }) => void,
    onRepoComplete?: (result: ParallelGradingResult) => void,
    onRepoEvent?: (repoInfo: { owner: string; repo: string }, event: RepoEventData) => void
  ): Promise<ParallelTestResults> {
    if (this.clonedRepos.length === 0) {
      throw new Error(
        "No repositories cloned. Call cloneRepositories() first."
      );
    }

    const totalStartTime = Date.now();

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

        const result = await codexService.startGrading(prompt, {
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
        });

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

  getTestRepoUrls(): string[] {
    const urls: string[] = [];
    for (let i = 0; i < this.repoCount; i++) {
      urls.push(this.TEST_REPOS[i % this.TEST_REPOS.length]);
    }
    return urls;
  }
}
