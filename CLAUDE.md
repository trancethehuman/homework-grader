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

### Environment Variables

- **GITHUB_TOKEN**: Personal access token for GitHub API (when using GitHub API mode)
- **GITHUB_MAX_DEPTH**: Maximum directory depth for GitHub API processing (default: 5)  
- **GITHUB_API_ONLY**: Set to 'true' to force GitHub API mode instead of Vercel Sandbox
- **AI provider variables**: Various API keys for different AI providers (OpenAI, Anthropic, Google, etc.)

### Vercel Sandbox Performance Architecture

The system now uses **Vercel Sandbox** as the primary repository processing method, delivering dramatically improved performance:

#### **Performance Characteristics**
- **5-20x faster** than GitHub API approach for typical repositories
- **No rate limits** - processes repositories as fast as the sandbox can handle
- **No depth restrictions** - analyzes complete repository structure
- **Real-time metrics** - displays files/second processing speed

#### **File Reading Optimization Strategies**

1. **Bulk Reading (≤100 files)**:
   ```bash
   # Single command processes all files with delimiters
   bash -c 'echo "FILE_START:file1.js"; cat "file1.js"; echo "FILE_END:file1.js"; 
            echo "FILE_START:file2.js"; cat "file2.js"; echo "FILE_END:file2.js"'
   ```

2. **Parallel Batching (>100 files)**:
   ```typescript
   // Process multiple 20-file batches simultaneously
   const batchPromises = batches.map(batch => this.readFilesBulk(batch));
   await Promise.all(batchPromises);
   ```

3. **Multi-Level Fallback System**:
   - Primary: Bulk bash script reading
   - Secondary: Parallel individual file reads
   - Tertiary: Sequential file reads (GitHub API style)

#### **Expected Performance Improvements**
| Repository Size | GitHub API Time | Vercel Sandbox Time | Speed Improvement |
|----------------|----------------|-------------------|------------------|
| 10 files | 10-20 seconds | 1-2 seconds | **5-10x faster** |
| 50 files | 50-100 seconds | 2-5 seconds | **10-20x faster** |
| 100+ files | 2-5 minutes | 5-15 seconds | **10-20x faster** |

#### **Sandbox Infrastructure**
- **Runtime**: Amazon Linux 2023 with Node.js 22 or Python 3.13
- **Resources**: 4 vCPUs, 8GB memory (2GB per vCPU)
- **Timeout**: 10 minutes default (up to 45 minutes maximum)
- **Network**: Isolated environment with internet access for git cloning
- **Storage**: Ephemeral `/tmp` directory for repository cloning

## Architecture

The codebase includes:

### Core Components

- **URLLoader Class** (`src/url-loader.ts`)

  - TypeScript implementation with strong typing
  - Loads URLs from CSV files with validation
  - Filters and deduplicates valid HTTP/HTTPS URLs
  - Async/await pattern for CSV processing

- **GitHubService Class** (`src/github/github-service.ts`)

  - Processes GitHub repositories and extracts file contents using GitHub API
  - Token validation with `validateToken()` method
  - Rate limit handling with automatic retry logic
  - Configurable file extension filtering
  - Batch processing to respect GitHub API limits
  - Error handling for authentication and permission issues

- **SandboxService Class** (`src/lib/vercel-sandbox/sandbox-service.ts`)

  - **NEW**: High-performance repository processing using Vercel Sandbox (now default)
  - **Ultra-Fast File Reading**: Optimized parallel and bulk reading strategies
    - Bulk reading: Single bash command processes multiple files simultaneously
    - Parallel batching: Up to 20-100 files processed concurrently
    - Performance metrics: Real-time files/second tracking
    - Smart adaptation: Different strategies for small vs large repositories
    - Robust fallback: Automatic fallback to individual reads if bulk fails
  - **Isolated Environment**: Spins up dedicated Linux MicroVM for each session
  - **Direct Git Cloning**: Clones repositories with shallow depth for performance
  - **No Depth Limitations**: Processes complete repository structure without artificial limits
  - **Comprehensive Logging**: Detailed status tracking with emojis and timing metrics
  - **Resource Management**: Automatic cleanup of sandbox and cloned repositories
  - **Error Resilience**: Multiple fallback mechanisms and graceful error handling
  - **Identical Output Format**: 100% compatible with existing grading pipeline

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
  - **NEW**: Defaults to Vercel Sandbox processing with GitHub API fallback
  - Processes GitHub URLs from CSV files using sandbox environment
  - Displays comprehensive processing status and timing information
  - Generates repository content files in `test-results/` directory
  - Comprehensive error handling with automatic fallback mechanisms
  - Authentication status display for GitHub API when used

### Vercel Sandbox Components

- **SandboxFileProcessor Class** (`src/lib/vercel-sandbox/sandbox-file-processor.ts`)
  - **High-Performance File Filtering**: Uses identical logic to GitHubService but optimized for local processing
  - **No Depth Restrictions**: Removed artificial depth limitations for complete analysis
  - **Efficient Pattern Matching**: Fast file path and extension filtering
  - **Optimized Find Commands**: Builds efficient find command arguments

- **Sandbox Types** (`src/lib/vercel-sandbox/sandbox-types.ts`)
  - **TypeScript Interfaces**: Complete type safety for all sandbox operations
  - **Repository Information**: Structured data for cloned repositories
  - **File Content Types**: Optimized structures for bulk file processing
  - **Configuration Types**: Sandbox runtime and resource configuration

### Constants

- **Ignored Extensions** (`src/consts/ignored-extensions.ts`)
  - Comprehensive list of file extensions to ignore when processing repositories
  - Includes images, videos, audio, archives, documents, executables, fonts, binaries, compiled files, and vector databases
  - Organized by category for easy maintenance
  - Used by both GitHubService and SandboxService for consistent filtering

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
- **Dual Processing Methods**:
  - **Vercel Sandbox (Default)**: High-performance isolated environment processing
  - **GitHub API (Fallback)**: Traditional API-based repository processing
- **Ultra-High Performance Repository Processing**:
  - **5-20x faster** than traditional GitHub API approach
  - **Parallel file reading**: Bulk and batch processing strategies
  - **Real-time performance metrics**: Files/second tracking and timing data
  - **No depth limitations**: Complete repository structure analysis
  - **No rate limits**: Process repositories as fast as hardware allows
  - **Smart optimization**: Adapts strategy based on repository size
  - **Robust error handling**: Multiple fallback mechanisms for reliability
  - **Identical output format**: 100% compatible with existing grading pipeline
- **GitHub Authentication Management** (GitHub API mode):
  - Secure token storage with platform-appropriate directories
  - Real-time token validation with GitHub API
  - Interactive token input with masked display
  - Browser integration for token generation
  - Environment variable support
  - Rate limit awareness (60 vs 5,000 requests/hour)
- **CSV Processing**: File validation, analysis, and URL extraction
- **Error Handling**: Comprehensive error handling with automatic fallback mechanisms
- **Resource Management**: Automatic sandbox cleanup and resource deallocation
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
