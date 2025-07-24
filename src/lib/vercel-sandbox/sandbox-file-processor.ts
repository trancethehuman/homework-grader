import { relative } from 'path';
import { DEFAULT_IGNORED_EXTENSIONS } from '../../consts/ignored-extensions.js';
import { FileContent, RepositoryContent, RepositoryInfo } from './sandbox-types.js';

export class SandboxFileProcessor {
  private ignoredExtensions: Set<string>;

  constructor(ignoredExtensions: string[] = DEFAULT_IGNORED_EXTENSIONS) {
    this.ignoredExtensions = new Set(ignoredExtensions.map(ext => ext.toLowerCase()));
  }

  shouldIgnoreFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const fileName = lowerPath.substring(lowerPath.lastIndexOf("/") + 1);
    const extension = lowerPath.substring(lowerPath.lastIndexOf("."));
    
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

    return false;
  }

  buildFindCommand(repoPath: string): string[] {
    // Since we have complex filtering logic, we'll get all files and filter in processFileList
    // This is simpler than building a complex find command with all ignore patterns
    return [
      repoPath,
      '-type', 'f',
      '-print'
    ];
  }

  async processRepositoryFiles(
    repoPath: string, 
    repositoryInfo: RepositoryInfo
  ): Promise<RepositoryContent> {
    const files: FileContent[] = [];
    
    // We'll get the file list from the sandbox service, so this method
    // will be called with the list of files to process
    throw new Error('This method should be called from SandboxService with file list');
  }

  processFileList(
    fileList: string[], 
    repoPath: string, 
    repositoryInfo: RepositoryInfo
  ): RepositoryContent {
    const files: FileContent[] = [];
    
    for (const filePath of fileList) {
      // Convert absolute path to relative path from repo root
      const relativePath = relative(repoPath, filePath);
      
      // Apply our filtering logic
      if (this.shouldIgnoreFile(relativePath)) {
        continue;
      }

      try {
        // Read file content (this will be handled by sandbox commands)
        // For now, we'll placeholder this - the actual reading will be done
        // by the sandbox service
        files.push({
          path: relativePath,
          content: '' // Will be filled by sandbox service
        });
      } catch (error) {
        console.warn(`Warning: Could not read file ${filePath}:`, error);
      }
    }

    const formattedContent = this.formatRepositoryContent(repositoryInfo, files);

    return {
      repository: repositoryInfo,
      files,
      totalFiles: files.length,
      formattedContent
    };
  }

  private formatRepositoryContent(repositoryInfo: RepositoryInfo, files: FileContent[]): string {
    let content = `# Repository: ${repositoryInfo.owner}/${repositoryInfo.repo}\n\n`;
    content += `Source URL: ${repositoryInfo.url}\n\n`;
    content += `Total files processed: ${files.length}\n\n`;
    content += '---\n\n';

    for (const file of files) {
      content += `## File: ${file.path}\n\n`;
      content += '```\n';
      content += file.content;
      content += '\n```\n\n';
    }

    return content;
  }
}