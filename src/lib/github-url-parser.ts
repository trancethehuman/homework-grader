/**
 * Parsed GitHub repository information.
 */
export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  url?: string;
}

/**
 * Parsed GitHub repository information with URL always included.
 */
export interface GitHubRepoInfoWithUrl {
  owner: string;
  repo: string;
  url: string;
}

/**
 * Utility class for parsing GitHub URLs into owner/repo components.
 * Consolidates URL parsing logic that was duplicated across services.
 */
export class GitHubUrlParser {
  private static readonly GITHUB_URL_REGEX = /github\.com\/([^\/]+)\/([^\/]+)/;

  /**
   * Parses a GitHub URL and extracts owner and repo information.
   * @param url The GitHub URL to parse
   * @returns Parsed repo info, or null if the URL is invalid
   */
  static parse(url: string): GitHubRepoInfo | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const match = url.match(this.GITHUB_URL_REGEX);
    if (!match) {
      return null;
    }

    const owner = match[1];
    let repo = match[2];

    // Remove .git suffix if present
    if (repo.endsWith('.git')) {
      repo = repo.slice(0, -4);
    }

    // Remove any trailing path components (e.g., /tree/main)
    repo = repo.split('/')[0];

    return { owner, repo };
  }

  /**
   * Parses a GitHub URL, throwing an error if invalid.
   * @param url The GitHub URL to parse
   * @returns Parsed repo info
   * @throws Error if the URL is not a valid GitHub repository URL
   */
  static parseOrThrow(url: string): GitHubRepoInfo {
    const result = this.parse(url);
    if (!result) {
      throw new Error(`Invalid GitHub URL: ${url}`);
    }
    return result;
  }

  /**
   * Parses a GitHub URL and includes the original URL in the result.
   * @param url The GitHub URL to parse
   * @returns Parsed repo info with original URL, or null if invalid
   */
  static parseWithUrl(url: string): GitHubRepoInfoWithUrl | null {
    const result = this.parse(url);
    if (!result) {
      return null;
    }
    return { ...result, url };
  }

  /**
   * Checks if a string is a valid GitHub repository URL.
   * @param url The string to check
   * @returns True if the string is a valid GitHub URL
   */
  static isValidGitHubUrl(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const trimmedUrl = url.trim();
    return (
      (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) &&
      trimmedUrl.includes('github.com') &&
      this.GITHUB_URL_REGEX.test(trimmedUrl)
    );
  }

  /**
   * Constructs a GitHub repository URL from owner and repo.
   * @param owner Repository owner
   * @param repo Repository name
   * @returns The constructed GitHub URL
   */
  static toUrl(owner: string, repo: string): string {
    return `https://github.com/${owner}/${repo}`;
  }
}
