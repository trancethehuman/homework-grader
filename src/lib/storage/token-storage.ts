import { BaseStringStorage } from './base-storage.js';

/**
 * Utility for securely storing and retrieving GitHub tokens.
 * Stores tokens in the user's config directory with appropriate permissions.
 */
export class TokenStorage extends BaseStringStorage {
  constructor() {
    super('github-token');
  }

  /**
   * Validates that the token is not empty.
   */
  protected validate(token: string): void {
    if (!token || token.trim() === '') {
      throw new Error('Token cannot be empty');
    }
  }

  /**
   * Saves a GitHub token securely.
   */
  saveToken(token: string): void {
    this.save(token);
  }

  /**
   * Retrieves the saved GitHub token.
   */
  getToken(): string | null {
    return this.load();
  }

  /**
   * Removes the saved token.
   */
  clearToken(): void {
    this.clear();
  }

  /**
   * Checks if a token is stored.
   */
  hasToken(): boolean {
    return this.exists();
  }
}
