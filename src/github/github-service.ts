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
      // Get the repository's default branch
      const repoResponse = await this.octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repoResponse.data.default_branch;

      // Get the tree for the entire repository in one API call
      const treeResponse = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: defaultBranch,
        recursive: "true",
      });

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
    } catch (error) {
      console.error(`Error fetching files from ${owner}/${repo}:`, error);
      throw error;
    }

    return files;
  }

  private async getFileContentByHash(
    owner: string,
    repo: string,
    sha: string
  ): Promise<string | null> {
    try {
      const response = await this.octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: sha,
      });

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
    concatenatedContent += `Ignored extensions: ${this.getIgnoredExtensions().join(
      ", "
    )}\n\n`;
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
