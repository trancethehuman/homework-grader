import open from "open";
import {
  NotionTokenStorage,
  NotionOAuthToken,
} from "./notion-token-storage.js";

const DEFAULT_PROXY_URL =
  process.env.NOTION_PROXY_URL || "http://localhost:8765";

export class NotionOAuthClient {
  private readonly proxyBaseUrl: string;
  private readonly storage: NotionTokenStorage;

  constructor(proxyBaseUrl: string = DEFAULT_PROXY_URL) {
    this.proxyBaseUrl = proxyBaseUrl.replace(/\/$/, "");
    this.storage = new NotionTokenStorage();
  }

  async ensureAuthenticated(): Promise<NotionOAuthToken> {
    const existing = this.storage.getToken();
    if (existing && existing.access_token) {
      return existing;
    }
    const token = await this.performOAuth();
    this.storage.saveToken(token);
    return token;
  }

  async refreshIfPossible(): Promise<NotionOAuthToken | null> {
    const existing = this.storage.getToken();
    if (!existing || !existing.refresh_token) {
      return null;
    }
    const res = await fetch(`${this.proxyBaseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: existing.refresh_token }),
    });
    if (!res.ok) {
      return null;
    }
    const updated = await res.json();
    const merged = { ...existing, ...updated } as NotionOAuthToken;
    this.storage.saveToken(merged);
    return merged;
  }

  private async performOAuth(): Promise<NotionOAuthToken> {
    const startRes = await fetch(`${this.proxyBaseUrl}/auth/start`);
    if (!startRes.ok) {
      throw new Error(`Failed to start OAuth: ${startRes.status}`);
    }
    const { authUrl, state } = await startRes.json();
    await open(authUrl);
    const token = await this.pollForToken(state, 120000, 2000);
    return token;
  }

  private async pollForToken(
    state: string,
    timeoutMs: number,
    intervalMs: number
  ): Promise<NotionOAuthToken> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await fetch(`${this.proxyBaseUrl}/auth/status/${state}`);
      if (!res.ok) {
        throw new Error(`OAuth polling failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.status === "complete" && data.token) {
        return data.token as NotionOAuthToken;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("OAuth timeout");
  }
}
