import open from "open";
import {
  NotionTokenStorage,
  NotionOAuthToken,
} from "./notion-token-storage.js";

const DEFAULT_PROXY_URL =
  process.env.NOTION_PROXY_URL || "https://notion-proxy-8xr3.onrender.com";

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export class NotionOAuthClient {
  private readonly proxyBaseUrl: string;
  private readonly storage: NotionTokenStorage;
  private refreshInProgress: Promise<NotionOAuthToken | null> | null = null;
  private lastRefreshAttempt: number = 0;
  private readonly refreshCooldownMs: number = 30000; // 30 seconds between refresh attempts
  private readonly retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
  };

  constructor(proxyBaseUrl: string = DEFAULT_PROXY_URL) {
    this.proxyBaseUrl = proxyBaseUrl.replace(/\/$/, "");
    this.storage = new NotionTokenStorage();
  }

  async ensureAuthenticated(): Promise<NotionOAuthToken> {
    const existing = this.storage.getToken();

    // Check if token exists and is valid
    if (existing && existing.access_token) {
      // Check if token is expired
      if (this.storage.isTokenExpired(existing)) {
        console.log("🔄 Token expired, attempting to refresh...");
        const refreshed = await this.refreshIfPossible();
        if (refreshed) {
          console.log("✓ Token refreshed successfully");
          return refreshed;
        }
        console.log("⚠ Token refresh failed, requiring new authentication");
      } else if (this.shouldProactivelyRefresh(existing)) {
        // Proactively refresh token if it expires soon
        console.log("🔄 Token expires soon, proactively refreshing...");
        try {
          const refreshed = await this.refreshIfPossible();
          if (refreshed) {
            console.log("✓ Proactive token refresh successful");
            return refreshed;
          } else {
            console.log("⚠ Proactive refresh failed, using current token");
            return existing;
          }
        } catch (error) {
          console.log("⚠ Proactive refresh failed, using current token:", error instanceof Error ? error.message : String(error));
          return existing;
        }
      } else {
        // Token is valid and not expiring soon
        return existing;
      }
    }

    // No valid token, perform new OAuth
    const token = await this.performOAuth();
    this.storage.saveToken(token);
    return token;
  }

  private shouldProactivelyRefresh(token: NotionOAuthToken): boolean {
    if (!token.expires_at) {
      return false;
    }

    // Refresh if token expires within the next 10 minutes
    const refreshThresholdMs = 10 * 60 * 1000; // 10 minutes
    const timeUntilExpiry = token.expires_at - Date.now();

    return timeUntilExpiry <= refreshThresholdMs && timeUntilExpiry > 0;
  }

  async refreshIfPossible(): Promise<NotionOAuthToken | null> {
    // Check if a refresh is already in progress
    if (this.refreshInProgress) {
      console.log("🔄 Refresh already in progress, waiting...");
      return await this.refreshInProgress;
    }

    // Check cooldown period to prevent rapid successive attempts
    const now = Date.now();
    if (now - this.lastRefreshAttempt < this.refreshCooldownMs) {
      const remainingMs = this.refreshCooldownMs - (now - this.lastRefreshAttempt);
      console.log(`⏳ Refresh cooldown active, ${Math.ceil(remainingMs / 1000)}s remaining`);
      return null;
    }

    const existing = this.storage.getToken();
    if (!existing || !existing.refresh_token) {
      console.log("❌ No refresh token available");
      return null;
    }

    // Start refresh operation
    this.refreshInProgress = this.performRefreshWithRetry(existing);
    this.lastRefreshAttempt = now;

    try {
      const result = await this.refreshInProgress;
      return result;
    } finally {
      this.refreshInProgress = null;
    }
  }

  private async performRefreshWithRetry(existing: NotionOAuthToken): Promise<NotionOAuthToken | null> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempting to refresh Notion token (${attempt}/${this.retryConfig.maxRetries})...`);

        const res = await fetch(`${this.proxyBaseUrl}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: existing.refresh_token }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          const error = new Error(`Token refresh failed with status ${res.status}: ${errorText}`);

          // Handle different error types
          if (res.status === 401 || res.status === 403) {
            // Invalid refresh token - don't retry
            console.log("🧹 Invalid refresh token, clearing from storage");
            this.storage.clearToken();
            throw new Error("Refresh token is invalid or expired");
          } else if (res.status >= 500 && attempt < this.retryConfig.maxRetries) {
            // Server error - retry with exponential backoff
            console.log(`⚠️  Server error (${res.status}), will retry in ${this.calculateDelay(attempt)}ms`);
            lastError = error;
            await this.delay(this.calculateDelay(attempt));
            continue;
          }

          throw error;
        }

        const updated = await res.json();
        const merged = { ...existing, ...updated } as NotionOAuthToken;

        // Add expiration time if not present
        if (!merged.expires_at && updated.expires_in) {
          merged.expires_at = Date.now() + (updated.expires_in * 1000);
        } else if (!merged.expires_at) {
          // Default to 1 hour if no expiration info
          merged.expires_at = Date.now() + (60 * 60 * 1000);
        }

        this.storage.saveToken(merged);
        console.log(`✓ Token refreshed and saved successfully on attempt ${attempt}`);
        return merged;

      } catch (error) {
        lastError = error as Error;

        // Don't retry for certain errors
        if (error instanceof Error && error.message.includes("invalid or expired")) {
          throw error;
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.log(`❌ Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

    console.log(`❌ Token refresh failed after ${this.retryConfig.maxRetries} attempts`);
    throw lastError || new Error("Token refresh failed after all retry attempts");
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
