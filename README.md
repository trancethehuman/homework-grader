# Homework Grader

A high-performance TypeScript CLI for processing homework submissions from CSV files and Notion databases with ultra-fast GitHub repository analysis.

## Installation

### Global Installation (Recommended)

```bash
npm install -g homework-grader
```

### Using npx (No Installation Required)

```bash
npx homework-grader
```

### Local Development

```bash
git clone https://github.com/trancethehuman/homework-grader.git
cd homework-grader
pnpm install
pnpm build
pnpm start
```

## Quick Start

After installation, simply run:

```bash
homework-grader
```

The CLI will guide you through:
1. Setting up API keys (GitHub, E2B, AI providers)
2. Choosing data source (Notion Database or CSV File) 
3. Processing repositories and generating grades

## Features

- **Ultra-Fast Processing**: Sandbox integration with 5-20x performance boost
- **Dual Processing Modes**: Sandbox (default) with GitHub API fallback
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
# Optional override (defaults to hosted proxy if omitted):
# NOTION_PROXY_URL=https://<your-render-service>.onrender.com

# Sandbox (required for ultra-fast processing)
E2B_API_KEY="your-e2b-api-key"

# Optional GitHub API settings
GITHUB_TOKEN="your-github-token"
GITHUB_API_ONLY=true  # Force GitHub API mode (skip sandbox)
```

**Setup Instructions:**

1. **AI Providers**: Get API keys from [OpenAI](https://platform.openai.com/api-keys), [Anthropic](https://console.anthropic.com/), or [Google AI](https://makersuite.google.com/app/apikey)
2. **Notion**: Create integration at [Notion Developers](https://www.notion.so/my-integrations). Use OAuth via the bundled proxy instead of a Notion API key. The CLI will open a browser to connect your workspace.
3. **Sandbox**: Get API key from your [E2B Dashboard](https://e2b.dev/)

## Notion OAuth Architecture (short)

- CLI calls a minimal proxy (`/notion-proxy`) to start OAuth; client secret lives only on the proxy.
- Proxy routes: `/auth/start`, `/auth/status/:state`, `/callback`, `/refresh`.
- Redirect URI must match in Notion settings and proxy: `https://<render>/callback` (prod) or `http://localhost:8765/callback` (local).
- CLI stores the access token locally; it refreshes when possible and only prompts when needed.
- Free Render plan may cold-start; hit `/health` first to warm up if OAuth feels slow.

## Troubleshooting

### Permission Errors
If you encounter permission errors during global installation:
```bash
# On macOS/Linux - use sudo if needed
sudo npm install -g homework-grader

# Or use npx instead (no installation required)
npx homework-grader
```

### Node.js Version
Ensure you're using Node.js 22 or higher:
```bash
node --version  # Should be >= 22.0.0
```

### API Rate Limits
- **GitHub**: Without a token, you're limited to 60 requests/hour
- **Solution**: Provide a GitHub Personal Access Token when prompted

### Sandbox Issues
- **E2B**: If sandbox initialization fails, the CLI will automatically fall back to GitHub API
- **Solution**: Ensure your E2B API key is valid at [E2B Dashboard](https://e2b.dev/)

### Common Issues
1. **"Command not found"** - The global installation may have failed or your PATH is incorrect
   - Try: `npx homework-grader` instead
2. **"Module not found"** - Dependencies may be missing 
   - Try: Reinstalling with `npm install -g homework-grader --force`
3. **Notion OAuth fails** - The proxy service may be cold starting
   - Try: Wait a moment and retry the authentication

## License

MIT
