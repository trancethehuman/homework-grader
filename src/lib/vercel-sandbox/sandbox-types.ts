export interface RepositoryInfo {
  owner: string;
  repo: string;
  url: string;
}

export interface ClonedRepository {
  info: RepositoryInfo;
  localPath: string;
  cloneId: string;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface RepositoryContent {
  repository: RepositoryInfo;
  files: FileContent[];
  totalFiles: number;
  formattedContent: string;
}

export interface SandboxConfig {
  timeout?: number;
  vcpus?: number;
  runtime?: 'node22' | 'python3.13';
}

export interface FindCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}