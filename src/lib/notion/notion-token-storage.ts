import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { BaseJsonStorage } from "../storage/base-storage.js";

export interface NotionOAuthToken {
  access_token: string;
  workspace_id?: string;
  workspace_name?: string;
  bot_id?: string;
  duplicate_template_id?: string;
  owner?: any;
  refresh_token?: string;
  expires_at?: number;
}

/**
 * Utility for securely storing and retrieving Notion OAuth tokens.
 * Extends BaseJsonStorage with backup and expiry functionality.
 */
export class NotionTokenStorage extends BaseJsonStorage<NotionOAuthToken> {
  private readonly backupPath: string;

  constructor() {
    super("notion-oauth-token.json");
    this.backupPath = `${this.filePath}.backup`;
  }

  /**
   * Validates that the token has a valid access_token.
   */
  protected validate(token: NotionOAuthToken): void {
    if (!token || !token.access_token) {
      throw new Error("Invalid Notion token");
    }
    if (typeof token.access_token !== "string" || token.access_token.trim().length === 0) {
      throw new Error("Invalid access token format");
    }
  }

  /**
   * Saves a Notion OAuth token with backup.
   */
  saveToken(token: NotionOAuthToken): void {
    this.validate(token);
    this.ensureConfigDir();

    // Create backup of existing token before overwriting
    if (existsSync(this.filePath)) {
      try {
        const existingData = readFileSync(this.filePath, "utf8");
        writeFileSync(this.backupPath, existingData, { mode: 0o600 });
      } catch (error) {
        console.warn("Failed to create token backup:", error instanceof Error ? error.message : String(error));
      }
    }

    this.save(token);
  }

  /**
   * Retrieves the saved Notion OAuth token with backup recovery.
   */
  getToken(): NotionOAuthToken | null {
    const token = this.load();

    if (token) {
      // Validate token structure
      if (!token.access_token) {
        console.warn("Token file contains invalid data, attempting recovery from backup");
        return this.recoverFromBackup();
      }
      return token;
    }

    // Try recovery from backup if main file failed
    return this.recoverFromBackup();
  }

  /**
   * Attempts to recover token from backup file.
   */
  private recoverFromBackup(): NotionOAuthToken | null {
    if (!existsSync(this.backupPath)) {
      return null;
    }

    try {
      const backupData = readFileSync(this.backupPath, "utf8");
      if (!backupData || backupData.trim().length === 0) {
        return null;
      }

      const token = JSON.parse(backupData) as NotionOAuthToken;
      if (!token || !token.access_token) {
        return null;
      }

      console.log("Recovered token from backup, saving as primary");
      this.saveToken(token);
      return token;
    } catch (error) {
      console.warn("Failed to recover from backup:", error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Clears both the token file and backup.
   */
  clearToken(): void {
    const filesToClear = [this.filePath, this.backupPath];

    for (const file of filesToClear) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (error) {
          console.warn(`Failed to delete ${file}:`, error instanceof Error ? error.message : String(error));
          // Fallback to clearing content if deletion fails
          try {
            writeFileSync(file, "", { mode: 0o600 });
          } catch {
            // Ignore secondary failure
          }
        }
      }
    }
  }

  /**
   * Checks if a valid, non-expired token is stored.
   */
  hasToken(): boolean {
    const token = this.getToken();
    return !!(token && token.access_token && !this.isTokenExpired(token));
  }

  /**
   * Checks if the token is expired or will expire soon.
   */
  isTokenExpired(token?: NotionOAuthToken): boolean {
    if (!token) {
      const storedToken = this.getToken();
      if (!storedToken) return true;
      token = storedToken;
    }
    if (!token || !token.expires_at) {
      // If no expiration info, assume it's still valid
      return false;
    }
    // Check if token expires within the next 5 minutes (300 seconds buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    return Date.now() >= (token.expires_at - bufferTime);
  }

  /**
   * Alias for hasToken() - checks if a valid, non-expired token exists.
   */
  hasValidToken(): boolean {
    return this.hasToken();
  }
}
