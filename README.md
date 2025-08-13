# Homework Grader

A high-performance TypeScript CLI for processing homework submissions from CSV files with ultra-fast GitHub repository analysis.

## Quick Start

```bash
pnpm install
pnpm build
pnpm start
```

## Features

- **Ultra-Fast Processing**: Vercel Sandbox integration with 5-20x performance boost
- **Dual Processing Modes**: Vercel Sandbox (default) with GitHub API fallback
- **Interactive CLI**: React/Ink-based interface with step-by-step workflow
- **Real-Time Metrics**: Processing speed and timing data for all operations
- **Smart Optimization**: Adapts strategy based on repository size

## Scripts

- `pnpm build` - Build TypeScript (required first)
- `pnpm start` - Run interactive mode
- `pnpm run dev` - Development mode (no build needed)
- `pnpm start file.csv` - Legacy mode with CSV file

## Environment Variables

Create a `.env` file in the project root with the following required variables:

```bash
# AI Provider API Keys (at least one required)
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
GOOGLE_GENERATIVE_AI_API_KEY="your-google-ai-api-key"

# Notion OAuth (required for Notion access)
# Deploy `notion-proxy/` to Render and set env vars:
# NOTION_CLIENT_ID=234d872b-594c-80ec-9dac-00379870e655
# NOTION_CLIENT_SECRET=******
# REDIRECT_URI=https://<your-render-service>.onrender.com/callback
# Locally, you can run the proxy on :8765 and keep REDIRECT_URI=http://localhost:8765/callback
NOTION_PROXY_URL="http://localhost:8765"

# Vercel Sandbox (required for ultra-fast processing)
VERCEL_OIDC_TOKEN="your-vercel-oidc-token"
VERCEL_SANDBOX_ENABLED=true

# Optional GitHub API settings
GITHUB_TOKEN="your-github-token"
GITHUB_API_ONLY=true  # Force GitHub API mode (skip Vercel Sandbox)
```

**Setup Instructions:**

1. **AI Providers**: Get API keys from [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Google AI](https://makersuite.google.com/app/apikey)
2. **Notion**: Create integration at [Notion Developers](https://www.notion.so/my-integrations). Use OAuth via the bundled proxy instead of a Notion API key. The CLI will open a browser to connect your workspace.
3. **Vercel Sandbox**: Get OIDC token from your Vercel project settings

## License

MIT
