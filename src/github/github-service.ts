import { Octokit } from '@octokit/rest';
import { DEFAULT_IGNORED_EXTENSIONS } from '../consts/ignored-extensions';

interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

interface FileContent {
  path: string;
  content: string;
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
      ...(ignoredExtensions || [])
    ]);
  }

  addIgnoredExtensions(extensions: string[]): void {
    extensions.forEach(ext => this.ignoredExtensions.add(ext.toLowerCase()));
  }

  removeIgnoredExtensions(extensions: string[]): void {
    extensions.forEach(ext => this.ignoredExtensions.delete(ext.toLowerCase()));
  }

  getIgnoredExtensions(): string[] {
    return Array.from(this.ignoredExtensions).sort();
  }

  private shouldIgnoreFile(filePath: string): boolean {
    const extension = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
    return this.ignoredExtensions.has(extension);
  }

  parseGitHubUrl(url: string): GitHubRepoInfo | null {
    const githubUrlRegex = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/.*)?$/;
    const match = url.match(githubUrlRegex);
    
    if (!match) {
      return null;
    }

    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ''),
    };
  }

  async getAllFiles(owner: string, repo: string): Promise<FileContent[]> {
    const files: FileContent[] = [];
    
    try {
      await this.getFilesRecursively(owner, repo, '', files);
    } catch (error) {
      console.error(`Error fetching files from ${owner}/${repo}:`, error);
      throw error;
    }
    
    return files;
  }

  private async getFilesRecursively(
    owner: string,
    repo: string,
    path: string,
    files: FileContent[]
  ): Promise<void> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      const contents = Array.isArray(response.data) ? response.data : [response.data];

      for (const item of contents) {
        if (item.type === 'file') {
          if (!this.shouldIgnoreFile(item.path)) {
            const fileContent = await this.getFileContent(owner, repo, item.path);
            if (fileContent) {
              files.push({
                path: item.path,
                content: fileContent,
              });
            }
          }
        } else if (item.type === 'dir') {
          await this.getFilesRecursively(owner, repo, item.path, files);
        }
      }
    } catch (error) {
      console.error(`Error fetching directory ${path}:`, error);
    }
  }

  private async getFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(response.data) || response.data.type !== 'file') {
        return null;
      }

      if (response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error) {
      console.error(`Error fetching file ${path}:`, error);
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
    concatenatedContent += `Ignored extensions: ${this.getIgnoredExtensions().join(', ')}\n\n`;
    concatenatedContent += '---\n\n';

    for (const file of files) {
      concatenatedContent += `## File: ${file.path}\n\n`;
      concatenatedContent += '```\n';
      concatenatedContent += file.content;
      concatenatedContent += '\n```\n\n';
    }

    return concatenatedContent;
  }
}