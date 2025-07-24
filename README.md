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

# Notion Integration (required for database storage)
NOTION_API_KEY="your-notion-api-key"

# Vercel Sandbox (required for ultra-fast processing)
VERCEL_OIDC_TOKEN="your-vercel-oidc-token"
VERCEL_SANDBOX_ENABLED=true

# Optional GitHub API settings
GITHUB_TOKEN="your-github-token"
GITHUB_API_ONLY=true  # Force GitHub API mode (skip Vercel Sandbox)
```

**Setup Instructions:**
1. **AI Providers**: Get API keys from [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Google AI](https://makersuite.google.com/app/apikey)
2. **Notion**: Create integration at [Notion Developers](https://www.notion.so/my-integrations)
3. **Vercel Sandbox**: Get OIDC token from your Vercel project settings

## License

MIT
