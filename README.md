# CLI Agents Fleet

[![CI](https://github.com/trancethehuman/cli-agents-fleet/actions/workflows/ci.yml/badge.svg)](https://github.com/trancethehuman/cli-agents-fleet/actions/workflows/ci.yml)
[![Release](https://github.com/trancethehuman/cli-agents-fleet/actions/workflows/release.yml/badge.svg)](https://github.com/trancethehuman/cli-agents-fleet/actions/workflows/release.yml)
[![npm version](https://badge.fury.io/js/cli-agents-fleet.svg)](https://badge.fury.io/js/cli-agents-fleet)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

A powerful CLI for running AI agents at scale across your data - analyze repositories, manage GitHub collaborators, and perform bulk research from Notion, CSV, or manual input.

## Installation

### Global Installation (Recommended)

```bash
# From NPM (public)
npm install -g cli-agents-fleet

# From GitHub Packages (alternative)
npm install -g @trancethehuman/cli-agents-fleet
```

### Using npx (No Installation Required)

```bash
# From NPM (public)
npx cli-agents-fleet

# From GitHub Packages (alternative)
npx @trancethehuman/cli-agents-fleet
```

### Local Development

```bash
git clone https://github.com/trancethehuman/cli-agents-fleet.git
cd cli-agents-fleet
pnpm install
pnpm build
pnpm start
```

## Quick Start

After installation, simply run:

```bash
cli-agents-fleet
```

The CLI will guide you through:

1. Setting up API keys (GitHub, E2B, AI providers)
2. Choosing data source (Notion Database or CSV File)
3. Processing repositories and generating grades

### Automatic Updates

The CLI includes a built-in update checker that:

- ✅ **Checks daily** for new versions (cached, non-intrusive)
- ✅ **Shows friendly notifications** when updates are available
- ✅ **Provides clear update instructions**
- ✅ **Never interrupts your workflow** - notifications appear at the end
- ✅ **Fails silently** - won't break if update check fails

Example notification:

```
📦 Update available!
   Current: 1.0.0
   Latest:  1.1.0

   Run the following to update:
   npm install -g cli-agents-fleet@latest
```

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
sudo npm install -g cli-agents-fleet

# Or use npx instead (no installation required)
npx cli-agents-fleet
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
   - Try: `npx cli-agents-fleet` instead
2. **"Module not found"** - Dependencies may be missing
   - Try: Reinstalling with `npm install -g cli-agents-fleet --force`
3. **Notion OAuth fails** - The proxy service may be cold starting
   - Try: Wait a moment and retry the authentication

### Update Notifications

If you prefer to disable update checking:

```bash
# Set environment variable to disable update checks
export NO_UPDATE_NOTIFIER=true
cli-agents-fleet
```

## Development & Contributing

### Automatic Publishing

This package uses **fully automated publishing** - no manual steps required!

**Every push to `main` branch automatically:**

1. ✅ **Builds and tests** the package
2. ✅ **Auto-increments version** if needed (patch version bump)
3. ✅ **Publishes to NPM** as `cli-agents-fleet`
4. ✅ **Publishes to GitHub Packages** as `@trancethehuman/cli-agents-fleet`
5. ✅ **Creates GitHub Release** with changelog
6. ✅ **Creates git tag** for the version

#### How It Works

```bash
# Just push your changes to main
git add .
git commit -m "Add new feature"
git push origin main

# GitHub Actions automatically:
# - Detects if version exists on NPM
# - Increments patch version if needed (1.0.0 → 1.0.1)
# - Publishes to both NPM and GitHub Packages
# - Creates release notes
```

#### Version Management

- **First publish**: Uses version from `package.json` (currently 1.0.0)
- **Subsequent pushes**: Auto-increments patch version (1.0.0 → 1.0.1 → 1.0.2...)
- **Manual control**: Update `package.json` version manually for major/minor releases

### Setting up NPM Token (Maintainers)

For automated publishing, add `NPM_TOKEN` to repository secrets:

1. **Get NPM Token**:

   - Go to [npmjs.com](https://www.npmjs.com) → Profile → Access Tokens
   - Generate "Automation" token for `cli-agents-fleet`
   - Copy the token (starts with `npm_...`)

2. **Add to GitHub**:

   - Go to repository → Settings → Secrets and variables → Actions
   - Add secret: `NPM_TOKEN` with your token value

3. **Release Process**:

   ```bash
   # Update version and create git tag
   npm version patch  # or minor/major

   # Push to trigger automated release
   git push --follow-tags
   ```

### Git workflow with CI version bumps

This repository auto-publishes on pushes to `main`. If the current `package.json` version already exists on NPM, CI will bump the patch version and push a bot commit back to `main`. As a result, your local branch can become behind immediately after you push.

Recommended setup (one-time):

```bash
git config --global pull.rebase true
git config --global rebase.autostash true
# optional convenience
git config --global alias.up 'pull --rebase --autostash'
```

Project-only setup (repo-local, not global):

```bash
git config pull.rebase true
git config rebase.autostash true
git config alias.up 'pull --rebase --autostash'
# optional
git config pull.ff only

# verify local settings
git config --local --list | grep -E 'pull.rebase|rebase.autostash|alias.up|pull.ff'
```

Everyday flow:

```bash
# before pushing more changes after a prior push
git pull --rebase
git push
```

If you prefer to avoid CI pushing to `main`, switch to a tag-based release flow (create a tag locally with `npm version` and push tags) or a PR-based version bump workflow.

### CI/CD Pipeline

- ✅ **Multi-version testing** on Node.js 22 & 23
- ✅ **Package installation verification**
- ✅ **Dual publishing** to NPM + GitHub Packages
- ✅ **Automated GitHub releases** with changelog
- ✅ **Build artifacts** stored for debugging
- ✅ **Status badges** show real-time build status

## License

GNU
