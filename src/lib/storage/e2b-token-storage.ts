import { BaseStringStorage } from './base-storage.js';

/**
 * Utility for securely storing and retrieving E2B API keys.
 * Stores keys in the user's config directory with appropriate permissions.
 */
export class E2BTokenStorage extends BaseStringStorage {
  constructor() {
    super('e2b-api-key');
  }

  /**
   * Validates that the API key is not empty.
   */
  protected validate(apiKey: string): void {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('E2B API key cannot be empty');
    }
  }

  /**
   * Saves an E2B API key securely.
   */
  saveToken(apiKey: string): void {
    this.save(apiKey);
  }

  /**
   * Retrieves the saved E2B API key.
   */
  getToken(): string | null {
    return this.load();
  }

  /**
   * Removes the saved API key.
   */
  clearToken(): void {
    this.clear();
  }

  /**
   * Checks if an API key is stored.
   */
  hasToken(): boolean {
    return this.exists();
  }

  /**
   * Validates E2B API key format (basic check - just ensure it's not empty).
   */
  validateKeyFormat(apiKey: string): boolean {
    return Boolean(apiKey && apiKey.trim().length > 0);
  }
}
