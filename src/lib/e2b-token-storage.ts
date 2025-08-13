import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Utility for securely storing and retrieving E2B API keys
 * Stores keys in the user's config directory with appropriate permissions
 */
export class E2BTokenStorage {
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
    
    this.tokenFile = join(this.configDir, 'e2b-api-key');
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
   * Saves an E2B API key securely
   */
  saveToken(apiKey: string): void {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('E2B API key cannot be empty');
    }

    this.ensureConfigDir();
    
    // Simple obfuscation to prevent casual reading
    const obfuscated = Buffer.from(apiKey.trim()).toString('base64');
    writeFileSync(this.tokenFile, obfuscated, { mode: 0o600 });
  }

  /**
   * Retrieves the saved E2B API key
   */
  getToken(): string | null {
    if (!existsSync(this.tokenFile)) {
      return null;
    }

    try {
      const obfuscated = readFileSync(this.tokenFile, 'utf8');
      return Buffer.from(obfuscated.trim(), 'base64').toString('utf8');
    } catch (error) {
      console.error('Error reading stored E2B API key:', error);
      return null;
    }
  }

  /**
   * Removes the saved API key
   */
  clearToken(): void {
    if (existsSync(this.tokenFile)) {
      try {
        writeFileSync(this.tokenFile, '', { mode: 0o600 });
      } catch (error) {
        console.error('Error clearing E2B API key:', error);
      }
    }
  }

  /**
   * Checks if an API key is stored
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

  /**
   * Validates E2B API key format (basic check - just ensure it's not empty)
   */
  validateKeyFormat(apiKey: string): boolean {
    // Just check that it's not empty - let E2B API validate the actual format
    return Boolean(apiKey && apiKey.trim().length > 0);
  }
}