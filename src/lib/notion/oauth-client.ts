import open from "open";
import {
  NotionTokenStorage,
  NotionOAuthToken,
} from "./notion-token-storage.js";

const DEFAULT_PROXY_URL =
  process.env.NOTION_PROXY_URL || "https://notion-proxy-8xr3.onrender.com";

export class NotionOAuthClient {
  private readonly proxyBaseUrl: string;
  private readonly storage: NotionTokenStorage;

  constructor(proxyBaseUrl: string = DEFAULT_PROXY_URL) {
    this.proxyBaseUrl = proxyBaseUrl.replace(/\/$/, "");
    this.storage = new NotionTokenStorage();
  }

  async ensureAuthenticated(): Promise<NotionOAuthToken> {
    const existing = this.storage.getToken();
    if (existing && existing.access_token && !this.storage.isTokenExpired(existing)) {
      return existing;
    }

    // Token is expired or invalid, try to refresh it first
    if (existing && existing.refresh_token) {
      console.log("🔄 Token expired, attempting to refresh...");
      const refreshed = await this.refreshIfPossible();
      if (refreshed) {
        console.log("✓ Token refreshed successfully");
        return refreshed;
      }
      console.log("⚠ Token refresh failed, requiring new authentication");
    }

    const token = await this.performOAuth();
    this.storage.saveToken(token);
    return token;
  }

  async refreshIfPossible(): Promise<NotionOAuthToken | null> {
    const existing = this.storage.getToken();
    if (!existing || !existing.refresh_token) {
      console.log("❌ No refresh token available");
      return null;
    }

    try {
      console.log("🔄 Attempting to refresh Notion token...");
      const res = await fetch(`${this.proxyBaseUrl}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: existing.refresh_token }),
      });

      if (!res.ok) {
        console.log(`❌ Token refresh failed with status: ${res.status}`);
        if (res.status === 401 || res.status === 403) {
          // Invalid refresh token, clear stored token
          console.log("🧹 Clearing invalid token from storage");
          this.storage.clearToken();
        }
        return null;
      }

      const updated = await res.json();
      const merged = { ...existing, ...updated } as NotionOAuthToken;

      // Add expiration time if not present (default to 1 hour from now)
      if (!merged.expires_at && updated.expires_in) {
        merged.expires_at = Date.now() + (updated.expires_in * 1000);
      } else if (!merged.expires_at) {
        // Default to 1 hour if no expiration info
        merged.expires_at = Date.now() + (60 * 60 * 1000);
      }

      this.storage.saveToken(merged);
      console.log("✓ Token refreshed and saved successfully");
      return merged;
    } catch (error) {
      console.log("❌ Token refresh failed with error:", error instanceof Error ? error.message : String(error));
      return null;
    }
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
