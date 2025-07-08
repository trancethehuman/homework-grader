import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Utility for securely storing and retrieving GitHub tokens
 * Stores tokens in the user's config directory with appropriate permissions
 */
export class TokenStorage {
  private readonly configDir: string;
  private readonly tokenFile: string;

  constructor() {
    // Use platform-appropriate config directory
    const platform = process.platform;
    if (platform === 'win32') {
      this.configDir = join(process.env.APPDATA || homedir(), 'homework-grader');
    } else if (platform === 'darwin') {
      this.configDir = join(homedir(), 'Library', 'Application Support', 'homework-grader');
    } else {
      this.configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'homework-grader');
    }
    
    this.tokenFile = join(this.configDir, 'github-token');
  }

  /**
   * Ensures the config directory exists
   */
  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Saves a GitHub token securely
   */
  saveToken(token: string): void {
    if (!token || token.trim() === '') {
      throw new Error('Token cannot be empty');
    }

    this.ensureConfigDir();
    
    // Simple obfuscation to prevent casual reading
    const obfuscated = Buffer.from(token.trim()).toString('base64');
    writeFileSync(this.tokenFile, obfuscated, { mode: 0o600 });
  }

  /**
   * Retrieves the saved GitHub token
   */
  getToken(): string | null {
    if (!existsSync(this.tokenFile)) {
      return null;
    }

    try {
      const obfuscated = readFileSync(this.tokenFile, 'utf8');
      return Buffer.from(obfuscated.trim(), 'base64').toString('utf8');
    } catch (error) {
      console.error('Error reading stored token:', error);
      return null;
    }
  }

  /**
   * Removes the saved token
   */
  clearToken(): void {
    if (existsSync(this.tokenFile)) {
      try {
        writeFileSync(this.tokenFile, '', { mode: 0o600 });
      } catch (error) {
        console.error('Error clearing token:', error);
      }
    }
  }

  /**
   * Checks if a token is stored
   */
  hasToken(): boolean {
    return existsSync(this.tokenFile) && this.getToken() !== null;
  }

  /**
   * Gets the config directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }
}