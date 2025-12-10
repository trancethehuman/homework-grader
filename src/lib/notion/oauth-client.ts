import open from "open";
import {
  NotionTokenStorage,
  NotionOAuthToken,
} from "./notion-token-storage.js";
import { DebugLogger } from "../utils/debug-logger.js";
import { ApiTimeoutHandler, TimeoutConfig } from "./api-timeout-handler.js";

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

  // Timeout configurations for different OAuth operations
  private readonly oauthTimeouts: Record<string, TimeoutConfig> = {
    start: { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, operation: 'OAuth Start' },
    poll: { timeoutMs: 5000, retries: 1, retryDelayMs: 500, operation: 'OAuth Status Poll' },
    refresh: { timeoutMs: 10000, retries: 2, retryDelayMs: 1000, operation: 'Token Refresh' },
    browser: { timeoutMs: 5000, retries: 0, operation: 'Browser Open' }
  };

  constructor(proxyBaseUrl: string = DEFAULT_PROXY_URL) {
    this.proxyBaseUrl = proxyBaseUrl.replace(/\/$/, "");
    this.storage = new NotionTokenStorage();
  }

  /**
   * Warm up the proxy server with a lightweight health check request.
   * This helps detect cold starts early and gives users feedback.
   * @returns true if the server responded, false if it timed out or failed
   */
  async warmUpProxy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.proxyBaseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(60000), // 60s for cold start
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async ensureAuthenticated(): Promise<NotionOAuthToken> {
    const existing = this.storage.getToken();

    // Check if token exists and is valid
    if (existing && existing.access_token) {
      // Check if token is expired
      if (this.storage.isTokenExpired(existing)) {
        DebugLogger.debugAuth("Token expired, attempting to refresh...");
        const refreshed = await this.refreshIfPossible();
        if (refreshed) {
          DebugLogger.debugAuth("Token refreshed successfully");
          return refreshed;
        }
        DebugLogger.debugAuth("Token refresh failed, requiring new authentication");
      } else if (this.shouldProactivelyRefresh(existing)) {
        // Proactively refresh token if it expires soon
        DebugLogger.debugAuth("Token expires soon, proactively refreshing...");
        try {
          const refreshed = await this.refreshIfPossible();
          if (refreshed) {
            DebugLogger.debugAuth("Proactive token refresh successful");
            return refreshed;
          } else {
            DebugLogger.debugAuth("Proactive refresh failed, using current token");
            return existing;
          }
        } catch (error) {
          DebugLogger.debugAuth("Proactive refresh failed, using current token:", error instanceof Error ? error.message : String(error));
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

  /**
   * Force a new OAuth flow, clearing any existing tokens
   */
  async forceOAuth(): Promise<NotionOAuthToken> {
    // Clear any existing token first
    this.storage.clearToken();

    // Perform new OAuth
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
      return await this.refreshInProgress;
    }

    // Check cooldown period to prevent rapid successive attempts
    const now = Date.now();
    if (now - this.lastRefreshAttempt < this.refreshCooldownMs) {
      const remainingMs = this.refreshCooldownMs - (now - this.lastRefreshAttempt);
      return null;
    }

    const existing = this.storage.getToken();
    if (!existing || !existing.refresh_token) {
      // This is expected during initial authentication
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
        DebugLogger.debugAuth(`Attempting to refresh Notion token (${attempt}/${this.retryConfig.maxRetries})...`);

        const res = await ApiTimeoutHandler.withTimeout(async () => {
          return await fetch(`${this.proxyBaseUrl}/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: existing.refresh_token }),
          });
        }, {
          timeoutMs: 60000, // 60 seconds to handle cold proxy startup
          retries: 0, // We handle retries in the outer loop
          operation: `Token Refresh Attempt ${attempt}`
        });

        if (!res.ok) {
          const errorText = await res.text();
          const error = new Error(`Token refresh failed with status ${res.status}: ${errorText}`);

          // Handle different error types
          if (res.status === 401 || res.status === 403) {
            // Invalid refresh token - don't retry
            DebugLogger.debugAuth("Invalid refresh token, clearing from storage");
            this.storage.clearToken();
            throw new Error("Refresh token is invalid or expired");
          } else if (res.status === 500 && (errorText.includes("invalid_grant") || errorText.includes("unused token"))) {
            // Special case: 500 error with invalid_grant for unused tokens - treat as invalid token
            DebugLogger.debugAuth("Invalid grant error (unused token), clearing from storage");
            this.storage.clearToken();
            throw new Error("Refresh token is invalid or expired");
          } else if (res.status >= 500 && attempt < this.retryConfig.maxRetries) {
            // Server error - retry with exponential backoff
            DebugLogger.debugAuth(`Server error (${res.status}), will retry in ${this.calculateDelay(attempt)}ms`);
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
        DebugLogger.debugAuth(`Token refreshed and saved successfully on attempt ${attempt}`);
        return merged;

      } catch (error) {
        lastError = error as Error;

        // Don't retry for certain errors
        if (error instanceof Error && error.message.includes("invalid or expired")) {
          throw error;
        }

        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt);
          DebugLogger.debugAuth(`Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
          DebugLogger.debugAuth(`Retrying in ${delay}ms...`);
          await this.delay(delay);
        }
      }
    }

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
    DebugLogger.debug('🔐 Starting OAuth authentication flow...');

    // Start OAuth with extended timeout to handle cold proxy startup (up to 90 seconds)
    const { authUrl, state } = await ApiTimeoutHandler.withTimeout(async () => {
      DebugLogger.debug('🌐 Contacting OAuth proxy (may take up to 90s if server is cold)...');
      const startRes = await fetch(`${this.proxyBaseUrl}/auth/start`);
      if (!startRes.ok) {
        const errorText = await startRes.text().catch(() => 'Unknown error');
        throw new Error(`Failed to start OAuth (${startRes.status}): ${errorText}`);
      }
      return await startRes.json();
    }, {
      timeoutMs: 90000, // 90 seconds to handle cold proxy startup
      retries: 1,
      retryDelayMs: 2000,
      operation: 'OAuth Start (with cold server handling)'
    });

    DebugLogger.debug(' OAuth flow initiated, opening browser...');

    // Open browser with timeout (non-blocking fallback)
    let browserOpened = false;
    try {
      await ApiTimeoutHandler.withTimeout(async () => {
        await open(authUrl);
        return Promise.resolve();
      }, this.oauthTimeouts.browser);
      browserOpened = true;
      DebugLogger.debug(' Browser opened successfully');
    } catch (error) {
      DebugLogger.debug(` Browser auto-open failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Always provide console instructions for manual OAuth
    console.log('\n🔐 Notion OAuth Authentication Required');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    if (browserOpened) {
      console.log(' Browser should have opened automatically');
      console.log('🔗 If no browser opened, manually visit:');
    } else {
      console.log('🔗 Please manually open this URL in your browser:');
    }
    console.log(`\n   ${authUrl}\n`);
    console.log('📋 Steps:');
    console.log('   1. Open the URL above in your browser');
    console.log('   2. Sign in to Notion and grant permissions');
    console.log('   3. Wait for this CLI to detect the authorization');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Poll for token with enhanced timeout handling
    const token = await this.pollForTokenWithTimeout(state, 120000, 2000);
    DebugLogger.debug(' OAuth authentication completed successfully');
    return token;
  }

  private async pollForTokenWithTimeout(
    state: string,
    totalTimeoutMs: number,
    intervalMs: number
  ): Promise<NotionOAuthToken> {
    DebugLogger.debug(`🔄 Starting OAuth token polling (timeout: ${totalTimeoutMs}ms, interval: ${intervalMs}ms)...`);
    const start = Date.now();
    let attempts = 0;

    while (Date.now() - start < totalTimeoutMs) {
      attempts++;
      try {
        const token = await ApiTimeoutHandler.withTimeout(async () => {
          const res = await fetch(`${this.proxyBaseUrl}/auth/status/${state}`);
          if (!res.ok) {
            const errorText = await res.text().catch(() => 'Unknown error');
            throw new Error(`OAuth polling failed (${res.status}): ${errorText}`);
          }
          return await res.json();
        }, {
          timeoutMs: 8000, // 8 seconds per poll (allows for cold proxy)
          retries: 0, // Don't retry individual polls, we'll poll again
          operation: `OAuth Status Poll #${attempts}`
        });

        if (token.status === "complete" && token.token) {
          DebugLogger.debug(` OAuth token received after ${attempts} attempts in ${Date.now() - start}ms`);
          return token.token as NotionOAuthToken;
        }

        if (token.status === "error") {
          throw new Error(`OAuth failed: ${token.error || 'Unknown error'}`);
        }

        // Log progress every 10 seconds for better user feedback
        const elapsed = Date.now() - start;
        if (elapsed % 10000 < intervalMs) {
          const remaining = Math.round((totalTimeoutMs - elapsed) / 1000);
          console.log(`⏳ Waiting for OAuth completion... ${remaining}s remaining`);
          if (elapsed > 30000) { // After 30 seconds, remind user
            console.log(' If you haven\'t opened the browser yet, please visit the URL above');
          }
        }

      } catch (error) {
        DebugLogger.debug(` OAuth poll attempt ${attempts} failed: ${error instanceof Error ? error.message : String(error)}`);

        // If we're close to the total timeout, don't wait the full interval
        const elapsed = Date.now() - start;
        if (elapsed + intervalMs >= totalTimeoutMs) {
          break;
        }
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`OAuth timeout after ${attempts} attempts (${Math.round(totalTimeoutMs/1000)}s).

Possible solutions:
• Make sure you opened the OAuth URL in your browser
• Check if you completed the authorization in Notion
• Verify your internet connection is stable
• Try running the command again

If the browser didn't open automatically, manually copy and paste the OAuth URL from above.`);
  }

  private async pollForToken(
    state: string,
    timeoutMs: number,
    intervalMs: number
  ): Promise<NotionOAuthToken> {
    // Redirect to the enhanced version
    return this.pollForTokenWithTimeout(state, timeoutMs, intervalMs);
  }
}
