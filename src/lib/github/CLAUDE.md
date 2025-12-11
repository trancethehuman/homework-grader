# GitHub Integration

## Directory Structure

- `src/github/` - Main GitHubService class
- `src/lib/github/` - Utility modules (rate limiting, URL parsing, etc.)

## Reusable Components

**Always check for existing components before creating new ones:**

### Authentication
- `GitHubAuthInput` (`src/components/github-auth-input.tsx`) - Reusable GitHub token input with:
  - Token validation
  - Auto-save to storage
  - Browser auto-open to token page
  - Customizable title/description props
  - Back button support

### Rate Limiting
- `GitHubRateLimiter` (`src/lib/github/github-rate-limiter.ts`) - Handles retry logic with exponential backoff
- `RateLimitWarning` (`src/components/ui/RateLimitWarning.tsx`) - Shows rate limit status with wait/abort options
- `RateLimitCountdown` (`src/components/ui/RateLimitCountdown.tsx`) - Countdown timer while waiting for reset

## Key Files

| File | Purpose |
|------|---------|
| `src/github/github-service.ts` | Main service class with all GitHub API methods |
| `src/lib/github/github-rate-limiter.ts` | Rate limit handling with retry logic |
| `src/lib/github/rate-limit-checker.ts` | Pre-check rate limits before bulk operations |
| `src/lib/github/github-url-parser.ts` | Parse GitHub URLs to extract owner/repo |
| `src/lib/github/github-url-detector.ts` | Detect GitHub URLs in text |
