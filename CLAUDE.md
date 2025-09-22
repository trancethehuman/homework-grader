# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a homework grading system repository with TypeScript URL loading functionality for processing homework submissions from CSV files and GitHub repositories. The project is licensed under GNU License.

### OAuth/Proxy (short)

- Notion auth uses a tiny Express proxy in `notion-proxy/` deployed to Render (free plan supported).
- The proxy owns the Notion client secret and handles `/auth/start`, `/callback`, `/refresh`, and `/auth/status/:state`.
- The CLI calls the proxy to start OAuth, opens a browser, and stores the returned access token locally.
- Default proxy base points to the hosted instance; override with `NOTION_PROXY_URL` for local testing.
- **Auto-reauth on Invalid Token**: When a Notion token becomes invalid/expired, the system automatically triggers OAuth flow instead of returning to the previous step, ensuring seamless re-authentication.

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

#### NPM Package Installation (Recommended)

The application can be installed and used via npm/npx:

```bash
# One-time execution (no installation required)
npx homework-grader

# Global installation for repeated use
npm install -g homework-grader
homework-grader

# Local installation in a project
npm install homework-grader
npx homework-grader
```

#### Development Workflow

```bash
# Production workflow (for development)
pnpm run build          # Build first
pnpm start              # Interactive mode
pnpm start sample.csv   # Legacy mode with CSV file

### Notion in the CLI (very short)

- Selecting "Notion Database" shows a brief screen, detects existing access, and provides a shortcut to clear.
- We refresh tokens when possible and prompt for OAuth only when needed.
- **Automatic Re-authentication**: If a Notion token is invalid or expired when accessing databases, the system automatically clears the invalid token and triggers the OAuth flow, eliminating the need for users to manually navigate back and re-authenticate.

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
- **GITHUB_API_ONLY**: Set to 'true' to force GitHub API mode instead of E2B Sandbox
- **E2B_API_KEY**: E2B API key for sandbox-based repository processing
- **BROWSERBASE_API_KEY**: Browserbase API key for browser testing functionality
- **BROWSERBASE_PROJECT_ID**: Browserbase project ID for browser testing
- **AI provider variables**: Various API keys for different AI providers (OpenAI, Anthropic, Google, etc.)

### E2B Sandbox Performance Architecture

The system now uses **E2B Sandbox** as the primary repository processing method, delivering dramatically improved performance:

#### **Performance Characteristics**

- **5-20x faster** than GitHub API approach for typical repositories
- **No rate limits** - processes repositories as fast as the sandbox can handle
- **No depth restrictions** - analyzes complete repository structure
- **Real-time metrics** - displays files/second processing speed
- **Secure isolated environment** - Each processing session runs in a dedicated sandbox

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
   const batchPromises = batches.map((batch) => this.readFilesBulk(batch));
   await Promise.all(batchPromises);
   ```

3. **Multi-Level Fallback System**:
   - Primary: Bulk bash script reading via E2B commands
   - Secondary: Parallel individual file reads
   - Tertiary: Sequential file reads (GitHub API fallback)

#### **Expected Performance Improvements**

| Repository Size | GitHub API Time | E2B Sandbox Time | Speed Improvement |
| --------------- | --------------- | ---------------- | ----------------- |
| 10 files        | 10-20 seconds   | 1-2 seconds      | **5-10x faster**  |
| 50 files        | 50-100 seconds  | 2-5 seconds      | **10-20x faster** |
| 100+ files      | 2-5 minutes     | 5-15 seconds     | **10-20x faster** |

#### **Sandbox Infrastructure**

- **Runtime**: E2B cloud-based execution environment
- **Isolation**: Each processing session runs in a dedicated sandbox
- **Timeout**: 10 minutes default (configurable)
- **Network**: Secure internet access for git repository cloning
- **Storage**: Isolated temporary directory for repository processing
- **Security**: API key-based authentication with local storage

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

- **SandboxService Class** (`src/lib/sandbox/sandbox-service.ts`)

  - **NEW**: High-performance repository processing using E2B Sandbox (now default)
  - **Ultra-Fast File Reading**: Optimized parallel and bulk reading strategies
    - Bulk reading: Single bash command processes multiple files simultaneously
    - Parallel batching: Up to 20-100 files processed concurrently
    - Performance metrics: Real-time files/second tracking
    - Smart adaptation: Different strategies for small vs large repositories
    - Robust fallback: Automatic fallback to individual reads if bulk fails
  - **Isolated Environment**: Spins up dedicated E2B sandbox for each session
  - **Direct Git Cloning**: Clones repositories with shallow depth for performance
  - **No Depth Limitations**: Processes complete repository structure without artificial limits
  - **Comprehensive Logging**: Detailed status tracking with emojis and timing metrics
  - **Resource Management**: Automatic cleanup of sandbox and cloned repositories
  - **Error Resilience**: Multiple fallback mechanisms and graceful error handling
  - **Identical Output Format**: 100% compatible with existing grading pipeline
  - **Secure API Key Management**: Local storage with format validation

- **StagehandService Class** (`src/lib/stagehand/stagehand-service.ts`)

  - **NEW**: Optional Stagehand/Browserbase testing integration
  - **Browser Automation**: Uses Browserbase cloud browser infrastructure
  - **Test Suite**: Enhanced navigation and comprehensive action tests targeting Maven Agent Bootcamp
  - **Natural Language Actions**: Interact with web pages using natural language
  - **Multi-Step Interactions**: Page navigation, scrolling, clicking, and hovering actions
  - **Environment Configuration**: Uses BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID
  - **Keep-Alive Functionality**: Browser sessions remain active for 15 seconds after test completion
  - **Error Handling**: Comprehensive error handling with graceful degradation
  - **Resource Cleanup**: Automatic cleanup of browser sessions with countdown timer

- **BrowserTestingService Class** (`src/lib/stagehand/browser-testing-service.ts`)

  - **NEW**: Production browser testing service for deployed applications
  - **Multi-Tab Support**: Tests up to 10 deployed URLs simultaneously using separate browser tabs
  - **Automated Interactions**: Performs natural language actions (clicks, scrolls, form interactions)
  - **Screenshot Capture**: Takes screenshots throughout testing process for visual verification
  - **Real-time Progress**: Provides live updates during testing with files/second metrics
  - **Comprehensive Results**: Captures test duration, actions performed, errors encountered
  - **Smart URL Detection**: Prioritizes column names over URL patterns for better accuracy
  - **Provider Support**: Works with Vercel, Netlify, Railway, Heroku, GitHub Pages, custom domains
  - **Resource Management**: Automatic cleanup of browser sessions and tabs

- **DeployedUrlDetector Class** (`src/lib/deployed-url-detector.ts`)

  - **NEW**: Intelligent detection of deployed application URLs in datasets
  - **Column Name Priority**: Heavily weights column names (deployed, app, demo, live, production)
  - **Pattern Recognition**: Recognizes hosting provider patterns for confidence scoring
  - **Custom Domain Support**: Handles custom domains that don't match hosting patterns
  - **GitHub Exclusion**: Automatically excludes GitHub repository URLs from detection
  - **Confidence Scoring**: Provides 0-100% confidence scores for URL column candidates
  - **Sample Preview**: Shows sample URLs for verification before testing begins

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
  - **NEW**: Integrated browser testing workflow after repository processing
  - **Browser Testing Prompt**: Optional step to test deployed applications after grading
  - **Deployed URL Detection**: Automatically detects columns containing deployed app URLs
  - **Multi-Tab Testing**: Tests up to 10 applications concurrently with real-time progress
  - **Results Integration**: Saves browser test results alongside grading data
  - **Non-intrusive Integration**: All existing workflows preserved, browser testing is optional

- **Token Storage Service** (`src/lib/token-storage.ts`)
  - Secure GitHub token storage with platform-appropriate locations
  - Base64 obfuscation for token protection
  - Cross-platform config directory management (Windows/macOS/Linux)
  - File permission management (0o600 for token files)
  - Token validation and cleanup methods

### Notion Data Conflict Protection

- **ConflictDetector Class** (`src/lib/notion/conflict-detector.ts`)
  - **NEW**: Intelligent detection of existing grading data before updates
  - **Cell-Level Conflict Checking**: Checks if grading columns already contain data
  - **Batch Conflict Processing**: Efficiently processes multiple repository updates
  - **Field-Level Granularity**: Identifies specific fields with existing data
  - **Property Value Extraction**: Handles all Notion property types (rich_text, select, etc.)
  - **Override Decision Support**: Applies user choices for keep/replace/skip actions

- **OverrideConfirmation Component** (`src/components/notion/override-confirmation.tsx`)
  - **NEW**: Interactive UI for resolving data conflicts
  - **Bulk Action Options**: Replace all, keep all, field-by-field review, or cancel
  - **Detailed Conflict View**: Shows existing vs new values for each field
  - **Repository-by-Repository Flow**: Guides users through each conflict systematically
  - **Progress Tracking**: Displays conflict resolution progress
  - **User-Friendly Interface**: Clear navigation with arrow keys and enter selection

- **Enhanced GradingDatabaseService** (`src/lib/notion/grading-database-service.ts`)
  - **NEW**: Conflict-aware Notion database operations
  - **Pre-Save Conflict Detection**: Checks for existing data before updates
  - **Conditional Override Processing**: Applies user decisions for partial updates
  - **Legacy Support**: Maintains backward compatibility with existing save methods
  - **Error Resilience**: Comprehensive error handling during conflict resolution

### CLI Interface

- **Command Line Interface** (`src/cli.tsx`)
  - Supports both interactive mode and legacy CSV file argument
  - **NEW**: Defaults to E2B Sandbox processing with GitHub API fallback
  - Processes GitHub URLs from CSV files using E2B sandbox environment
  - Displays comprehensive processing status and timing information
  - Generates repository content files in `test-results/` directory
  - Comprehensive error handling with automatic fallback mechanisms
  - Authentication status display for GitHub API when used

### E2B Sandbox Components

- **SandboxFileProcessor Class** (`src/lib/sandbox/sandbox-file-processor.ts`)

  - **High-Performance File Filtering**: Uses identical logic to GitHubService but optimized for local processing
  - **No Depth Restrictions**: Removed artificial depth limitations for complete analysis
  - **Efficient Pattern Matching**: Fast file path and extension filtering
  - **Optimized Find Commands**: Builds efficient find command arguments

- **Sandbox Types** (`src/lib/sandbox/sandbox-types.ts`)

  - **TypeScript Interfaces**: Complete type safety for all sandbox operations
  - **Repository Information**: Structured data for cloned repositories
  - **File Content Types**: Optimized structures for bulk file processing
  - **Configuration Types**: Sandbox runtime and resource configuration

- **E2B Token Storage** (`src/lib/e2b-token-storage.ts`)
  - **Secure API Key Storage**: Platform-appropriate config directories
  - **Format Validation**: Validates E2B API key format (e2b\_[32-char hex])
  - **Cross-platform Support**: Works on Windows, macOS, and Linux
  - **Token Management**: Save, retrieve, and clear API keys securely

### Constants

- **AI Provider Configuration** (`src/consts/ai-providers.ts`)

  - **NEW**: Context window limits for optimal chunking
  - **AIProvider Interface**: Enhanced with `contextWindowTokens` field for token limits
  - **DEFAULT_CONTEXT_WINDOW_TOKENS**: 128,000 tokens default for unknown models
  - **Model-Specific Limits**:
    - Gemini 2.5 Flash Lite: 128,000 tokens
    - OpenAI GPT-4.1: 2,000,000 tokens
    - Claude Sonnet 4: 200,000 tokens
  - **Context Window Optimization**: Prevents API failures from oversized repositories
  - **Intelligent Chunking**: Automatic content splitting when limits exceeded

- **Ignored Extensions** (`src/consts/ignored-extensions.ts`)

  - Comprehensive list of file extensions to ignore when processing repositories
  - Includes images, videos, audio, archives, documents, executables, fonts, binaries, compiled files, and vector databases
  - Organized by category for easy maintenance
  - Used by both GitHubService and SandboxService for consistent filtering

- **Stagehand Test Configuration** (`src/consts/stagehand-test.ts`)
  - **NEW**: Constants for Stagehand/Browserbase testing
  - **STAGEHAND_TEST_URL**: Target website for all tests (Maven Agent Bootcamp)
  - **BROWSER_SESSION_KEEP_ALIVE_MS**: 15-second delay before browser cleanup
  - **COUNTDOWN_UPDATE_INTERVAL_MS**: 1-second interval for countdown display

### Data Files

- `sample.csv` - Example CSV file with name, website, and description columns
- Supports any CSV format with URL data in any column
- `test-results/` - Directory for generated repository content files
- `dist/` - Compiled JavaScript output directory

### Examples

- `src/example.ts` - Demonstrates TypeScript URLLoader usage

### Test Components

- **StagehandTest Component** (`src/components/stagehand-test.tsx`)

  - **Interactive Test Interface**: Menu-driven test selection with arrow key navigation
  - **Enhanced Test Scenarios**: Comprehensive navigation and multi-step action tests targeting Maven Agent Bootcamp
  - **Configuration Validation**: Checks for required Browserbase credentials
  - **Real-time Results**: Displays test results with timing information
  - **Browser Session Management**: 15-second keep-alive with countdown timer
  - **Early Termination**: Press 'c' to close browser session before countdown expires
  - **Graceful Error Handling**: User-friendly error messages and fallbacks
  - **Navigation Controls**: Back/quit options to return to main workflow

- **DeployedUrlSelector Component** (`src/components/deployed-url-selector.tsx`)

  - **NEW**: Smart selection interface for deployed application URL columns
  - **Column Analysis**: Analyzes Notion database columns for deployed URL patterns
  - **Confidence Display**: Shows confidence scores and sample URLs for each candidate
  - **Auto-Selection**: Automatically selects high-confidence single candidates (80%+ confidence)
  - **Provider Detection**: Identifies hosting providers (Vercel, Netlify, etc.) for context
  - **Interactive Navigation**: Arrow key selection with preview and quick-start options

- **BrowserTesting Component** (`src/components/browser-testing.tsx`)
  - **NEW**: Real-time browser testing interface with progress tracking
  - **Multi-Tab Progress**: Shows active tabs and testing status for up to 10 concurrent tests
  - **Live Metrics**: Displays success/failure counts, duration, and action summaries
  - **Configuration Validation**: Checks Browserbase credentials before testing
  - **Early Termination**: Allows user to terminate testing early if needed
  - **Results Display**: Shows recent test results with screenshots and action counts
  - **Resource Management**: Handles browser session cleanup with user feedback

### Key Features

- **TypeScript**: Full type safety and compilation
- **Interactive CLI**: React/Ink components with step-by-step workflow
- **Dual Processing Methods**:
  - **E2B Sandbox (Default)**: High-performance isolated cloud environment processing
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
- **Context Window Optimization**:
  - **Intelligent Chunking**: Automatically splits large repositories to prevent API failures
  - **Model-Aware Limits**: Respects each AI model's token limits (Gemini: 128K, GPT-4.1: 2M, Claude: 200K)
  - **Progressive Analysis**: Processes repository chunks sequentially with context carryover
  - **Comprehensive Aggregation**: Synthesizes chunk feedback into final cohesive review
  - **Seamless Fallback**: Transparent chunking when content exceeds context windows
  - **Token Estimation**: Proactive content size validation before processing
- **Authentication Management**:
  - **GitHub**: Secure token storage, validation, browser integration for token generation
  - **E2B**: API key storage with format validation and secure local storage
  - **Browserbase**: API key and project ID for browser testing deployed applications
  - Platform-appropriate config directories (Windows/macOS/Linux)
  - Interactive credential setup with masked input display
  - Environment variable support for development
  - Rate limit awareness (GitHub: 60 vs 5,000 requests/hour, E2B: no limits)
- **Browser Testing for Deployed Applications**:
  - **Multi-Tab Testing**: Test up to 10 deployed URLs simultaneously
  - **Smart URL Detection**: Prioritizes column names over URL patterns for accuracy
  - **Automated Interactions**: Natural language actions (clicks, scrolls, forms)
  - **Screenshot Capture**: Visual verification throughout testing process
  - **Real-time Progress**: Live updates with success/failure metrics
  - **Provider Support**: Vercel, Netlify, Railway, Heroku, GitHub Pages, custom domains
  - **Results Integration**: Saves browser test data alongside grading results in files and Notion
- **Data Conflict Protection for Notion Database**:
  - **NEW**: Intelligent conflict detection before saving grading results
  - **Cell-Level Checking**: Identifies existing data in grading columns that would be overwritten
  - **User Choice Interface**: Interactive prompts for keep/replace/skip decisions
  - **Bulk Actions**: Replace all, keep all, or field-by-field review options
  - **Progress Tracking**: Clear indication of conflict resolution progress
  - **Non-Destructive by Default**: Prevents accidental data loss
  - **Legacy Compatibility**: Seamless integration with existing save workflows
- **CSV Processing**: File validation, analysis, and URL extraction
- **Error Handling**: Comprehensive error handling with automatic fallback mechanisms
- **Resource Management**: Automatic sandbox and browser session cleanup
- **File Management**: Automatic deduplication and validation

## Important Instructions

**ALWAYS update this CLAUDE.md file as the last step of every successful change** when the user confirms the changes are good. Keep the file current with:

- New build/test/lint commands as they're added
- Architecture changes and new components
- Development workflow updates
- Any new conventions or patterns established
- Never write in-line comments in the code

### Documentation Reading Guidelines

**DO NOT install dependencies or packages** when reading documentation websites or tutorials. When documentation mentions installing packages (npm install, pnpm install, etc.), assume the user has already installed the necessary dependencies for their project. Only install packages if:

1. The user explicitly requests installation of specific packages
2. You are adding new functionality that requires new dependencies not currently in the project
3. The user is starting a completely new project from scratch

This prevents unnecessary package installations when simply researching or understanding existing functionality.

## Build-First Workflow

Remember that users should always build the project first:

1. `pnpm install` (install dependencies)
2. `pnpm run build` (build TypeScript)
3. `pnpm start` (run the built application)

The `pnpm run dev` command is for development only and bypasses the build step.
