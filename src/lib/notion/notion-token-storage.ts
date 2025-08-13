import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
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
    this.ensureConfigDir();
    const data = JSON.stringify(token, null, 2);
    writeFileSync(this.tokenFile, data, { mode: 0o600 });
  }

  getToken(): NotionOAuthToken | null {
    if (!existsSync(this.tokenFile)) {
      return null;
    }
    try {
      const data = readFileSync(this.tokenFile, "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  clearToken(): void {
    if (existsSync(this.tokenFile)) {
      try {
        writeFileSync(this.tokenFile, "", { mode: 0o600 });
      } catch {}
    }
  }

  hasToken(): boolean {
    const token = this.getToken();
    return !!(token && token.access_token);
  }
}
