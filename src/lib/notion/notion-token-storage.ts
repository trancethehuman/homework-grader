import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

export class NotionTokenStorage {
  private readonly configDir: string;
  private readonly tokenFile: string;

  constructor() {
    const platform = process.platform;
    if (platform === "win32") {
      this.configDir = join(
        process.env.APPDATA || homedir(),
        "homework-grader"
      );
    } else if (platform === "darwin") {
      this.configDir = join(
        homedir(),
        "Library",
        "Application Support",
        "homework-grader"
      );
    } else {
      this.configDir = join(
        process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
        "homework-grader"
      );
    }
    this.tokenFile = join(this.configDir, "notion-oauth-token.json");
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

  saveToken(token: NotionOAuthToken): void {
    if (!token || !token.access_token) {
      throw new Error("Invalid Notion token");
    }

    // Validate token structure
    if (typeof token.access_token !== 'string' || token.access_token.trim().length === 0) {
      throw new Error("Invalid access token format");
    }

    this.ensureConfigDir();

    // Create backup of existing token before overwriting
    if (existsSync(this.tokenFile)) {
      try {
        const backupFile = `${this.tokenFile}.backup`;
        const existingData = readFileSync(this.tokenFile, "utf8");
        writeFileSync(backupFile, existingData, { mode: 0o600 });
      } catch (error) {
        console.warn("Failed to create token backup:", error instanceof Error ? error.message : String(error));
      }
    }

    const data = JSON.stringify(token, null, 2);
    writeFileSync(this.tokenFile, data, { mode: 0o600 });
  }

  getToken(): NotionOAuthToken | null {
    if (!existsSync(this.tokenFile)) {
      return null;
    }
    try {
      const data = readFileSync(this.tokenFile, "utf8");

      // Check if file is empty or corrupted
      if (!data || data.trim().length === 0) {
        console.warn("Token file is empty, attempting recovery from backup");
        return this.recoverFromBackup();
      }

      const token = JSON.parse(data);

      // Validate token structure
      if (!token || !token.access_token) {
        console.warn("Token file contains invalid data, attempting recovery from backup");
        return this.recoverFromBackup();
      }

      return token;
    } catch (error) {
      console.warn("Failed to parse token file, attempting recovery from backup:", error instanceof Error ? error.message : String(error));
      return this.recoverFromBackup();
    }
  }

  private recoverFromBackup(): NotionOAuthToken | null {
    const backupFile = `${this.tokenFile}.backup`;
    if (!existsSync(backupFile)) {
      return null;
    }

    try {
      const backupData = readFileSync(backupFile, "utf8");
      if (!backupData || backupData.trim().length === 0) {
        return null;
      }

      const token = JSON.parse(backupData);
      if (!token || !token.access_token) {
        return null;
      }

      console.log("🔄 Recovered token from backup, saving as primary");
      this.saveToken(token);
      return token;
    } catch (error) {
      console.warn("Failed to recover from backup:", error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  clearToken(): void {
    const filesToClear = [this.tokenFile, `${this.tokenFile}.backup`];

    for (const file of filesToClear) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
          console.log(`🗑️  Deleted token file: ${file}`);
        } catch (error) {
          console.warn(`Failed to delete ${file}:`, error instanceof Error ? error.message : String(error));
          // Fallback to clearing content if deletion fails
          try {
            writeFileSync(file, "", { mode: 0o600 });
            console.log(`📝 Cleared content of ${file}`);
          } catch {}
        }
      }
    }
  }

  hasToken(): boolean {
    const token = this.getToken();
    return !!(token && token.access_token && !this.isTokenExpired(token));
  }

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

  hasValidToken(): boolean {
    const token = this.getToken();
    return !!(token && token.access_token && !this.isTokenExpired(token));
  }
}
