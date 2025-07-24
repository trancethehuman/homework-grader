# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a homework grading system repository with TypeScript URL loading functionality for processing homework submissions from CSV files and GitHub repositories. The project is licensed under MIT License.

## Development Setup

### Package Manager

This project uses **pnpm** as the package manager. Install dependencies with:

```bash
pnpm install
```

### Build Process

**IMPORTANT**: Always build the project first before running any scripts:

```bash
# Build first (REQUIRED)
pnpm run build

# Then run in production mode
pnpm start
```

### TypeScript Scripts

- **Build**: `pnpm run build` (compiles TypeScript to JavaScript) - **REQUIRED FIRST STEP**
- **Start**: `pnpm start` (runs compiled version from `dist/cli.js`)
- **Dev**: `pnpm run dev` (development with ts-node, bypasses build)
- **Clean**: `pnpm run clean` (removes dist directory)
- **Test**: `pnpm test` (placeholder - no tests configured)

### Dependencies

- **Core**: `csv-parser` for CSV parsing, `@octokit/rest` for GitHub API
- **UI**: `ink` and `react` for interactive CLI, `open` for browser integration
- **Dev**: TypeScript, ts-node, @types/node, @types/react

### Usage Workflow

```bash
# Production workflow (recommended)
pnpm run build          # Build first
pnpm start              # Interactive mode
pnpm start sample.csv   # Legacy mode with CSV file

# Development workflow
pnpm run dev            # Interactive mode (no build required)
pnpm run dev sample.csv # Legacy mode with CSV file (no build required)
```

### GitHub Authentication

The application supports GitHub Personal Access Tokens for increased API rate limits:

- **With token**: 5,000 requests/hour
- **Without token**: 60 requests/hour (unauthenticated)

Authentication features:

- **Token Storage**: Securely stores tokens in platform-appropriate config directories
- **Token Validation**: Real-time token validation with GitHub API
- **Browser Integration**: Press 'o' to open GitHub token generation page
- **Token Management**: Clear stored tokens with 'c' command, skip with 's' command
- **Environment Support**: Reads from `GITHUB_TOKEN` environment variable

Set token via environment variable:

```bash
export GITHUB_TOKEN=your_token_here
pnpm run build
pnpm start
```

### Repository Depth Limiting

To prevent processing of very large repositories with deep directory structures, the system includes configurable depth limiting:

- **Default depth**: 5 levels deep
- **Environment variable**: Set `GITHUB_MAX_DEPTH=3` to limit to 3 levels
- **Example**: `src/components/ui/Button.tsx` = 4 levels deep

```bash
export GITHUB_MAX_DEPTH=3  # Only process files up to 3 directories deep
pnpm run build
pnpm start
```

This helps improve performance and reduces token consumption when processing large codebases.

## Architecture

The codebase includes:

### Core Components

- **URLLoader Class** (`src/url-loader.ts`)

  - TypeScript implementation with strong typing
  - Loads URLs from CSV files with validation
  - Filters and deduplicates valid HTTP/HTTPS URLs
  - Async/await pattern for CSV processing

- **GitHubService Class** (`src/github/github-service.ts`)

  - Processes GitHub repositories and extracts file contents
  - Token validation with `validateToken()` method
  - Rate limit handling with automatic retry logic
  - Configurable file extension filtering
  - Batch processing to respect GitHub API limits
  - Error handling for authentication and permission issues

- **Interactive CSV Component** (`src/interactive-csv.tsx`)

  - React/Ink based interactive CLI interface
  - Multi-step workflow: token setup → CSV input → column selection → processing
  - GitHub token input and management with secure storage
  - Token validation step with loading indicator
  - Browser integration for token generation
  - CSV file analysis and column detection
  - Automatic GitHub URL column suggestion
  - Arrow key navigation for column selection
  - Error handling with user-friendly messages

- **Token Storage Service** (`src/lib/token-storage.ts`)
  - Secure GitHub token storage with platform-appropriate locations
  - Base64 obfuscation for token protection
  - Cross-platform config directory management (Windows/macOS/Linux)
  - File permission management (0o600 for token files)
  - Token validation and cleanup methods

### CLI Interface

- **Command Line Interface** (`src/cli.tsx`)
  - Supports both interactive mode and legacy CSV file argument
  - Processes GitHub URLs from CSV files
  - Displays authentication status and rate limit information
  - Generates repository content files in `test-results/` directory
  - Comprehensive error handling for files and GitHub API
  - Authentication status display

### Constants

- **Ignored Extensions** (`src/consts/ignored-extensions.ts`)
  - Comprehensive list of file extensions to ignore when processing repositories
  - Includes images, videos, audio, archives, documents, executables, fonts, binaries, compiled files, and vector databases
  - Organized by category for easy maintenance
  - Configurable through GitHubService constructor

### Data Files

- `sample.csv` - Example CSV file with name, website, and description columns
- Supports any CSV format with URL data in any column
- `test-results/` - Directory for generated repository content files
- `dist/` - Compiled JavaScript output directory

### Examples

- `src/example.ts` - Demonstrates TypeScript URLLoader usage

### Key Features

- **TypeScript**: Full type safety and compilation
- **Interactive CLI**: React/Ink components with step-by-step workflow
- **GitHub Authentication Management**:
  - Secure token storage with platform-appropriate directories
  - Real-time token validation with GitHub API
  - Interactive token input with masked display
  - Browser integration for token generation
  - Environment variable support
  - Rate limit awareness (60 vs 5,000 requests/hour)
- **CSV Processing**: File validation, analysis, and URL extraction
- **GitHub Repository Processing**: Content extraction with file filtering
- **Error Handling**: Comprehensive error handling throughout the application
- **Rate Limiting**: Automatic retry logic for GitHub API rate limits
- **File Management**: Automatic deduplication and validation

## Important Instructions

**ALWAYS update this CLAUDE.md file as the last step of every successful change** when the user confirms the changes are good. Keep the file current with:

- New build/test/lint commands as they're added
- Architecture changes and new components
- Development workflow updates
- Any new conventions or patterns established
- Never write in-line comments in the code

## Build-First Workflow

Remember that users should always build the project first:

1. `pnpm install` (install dependencies)
2. `pnpm run build` (build TypeScript)
3. `pnpm start` (run the built application)

The `pnpm run dev` command is for development only and bypasses the build step.
