# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

CLI Agents Fleet - a platform for running AI agents at scale. See domain-specific docs:
- **Notion**: `/src/lib/notion/CLAUDE.md`
- **Codex**: `/src/lib/codex/CLAUDE.md`

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Build TypeScript (REQUIRED before running)
pnpm start            # Run compiled app
pnpm run dev          # Development mode (bypasses build)
pnpm run clean        # Remove dist directory
```

## Key Directories

- `src/components/` - React/Ink CLI components
- `src/components/ui/` - Reusable base UI components
- `src/lib/` - Core services and utilities
- `src/consts/` - Constants and configuration
- `src/prompts/` - Grading prompt templates
- `dist/` - Compiled output
- `test-results/` - Generated output files

## Environment Variables

Load from `.env` and `.env.local` (local takes precedence):

- `GITHUB_TOKEN` - GitHub API token
- `E2B_API_KEY` - E2B sandbox API key
- `BROWSERBASE_API_KEY` / `BROWSERBASE_PROJECT_ID` - Browser testing
- `DEBUG` / `DEBUG_NOTION` - Enable debug logging

## Important Rules

### Component Reuse

**ALWAYS check for existing components before creating new ones:**

1. Check `src/components/ui/` for reusable base components (buttons, inputs, selectors, etc.)
2. Check `src/components/` for existing feature components that may already solve your need
3. Only create a new component if no existing component can be adapted or extended

### Code Style

- Never write in-line comments in the code
- Never use emojis in code or output
- Use TypeScript with full type safety
- Follow existing patterns in the codebase

### Documentation Updates

**Update this CLAUDE.md file** when the user confirms changes are good:
- New commands or scripts
- Architecture changes
- New conventions or patterns

### Package Installation

**DO NOT install packages** when reading documentation. Only install if:
1. User explicitly requests it
2. Adding new functionality requiring new dependencies
3. Starting a new project from scratch
