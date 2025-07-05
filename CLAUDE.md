# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a homework grading system repository with TypeScript URL loading functionality for processing homework submissions from CSV files. The project is licensed under MIT License.

## Development Setup

### TypeScript
- Build: `npm run build` (compiles TypeScript to JavaScript)
- Run CLI: `npm run dev <path-to-csv-file>` (development with ts-node)
- Run built CLI: `npm start <path-to-csv-file>` (production build)
- Clean: `npm run clean` (removes dist directory)
- Dependencies: `csv-parser` for CSV parsing, TypeScript dev dependencies

### Usage
```bash
npm run dev sample.csv
```

## Architecture

The codebase includes:

### Core Components
- **URLLoader Class** (`src/url-loader.ts`)
  - TypeScript implementation with strong typing
  - Loads URLs from CSV files with validation
  - Filters and deduplicates valid HTTP/HTTPS URLs
  - Async/await pattern for CSV processing

### CLI Interface
- **Command Line Interface** (`src/cli.ts`)
  - Accepts CSV file path as command line argument
  - Displays loaded URLs and count
  - Error handling for invalid files

### Data Files
- `sample.csv` - Example CSV file with name, website, and description columns
- Supports any CSV format with URL data in any column

### Examples
- `src/example.ts` - Demonstrates TypeScript URLLoader usage

### Key Features
- TypeScript type safety and compilation
- CSV file validation (file existence, .csv extension)
- URL validation (HTTP/HTTPS protocols only)
- Automatic deduplication of URLs
- Error handling for file operations
- CLI interface for easy usage

## Important Instructions

**ALWAYS update this CLAUDE.md file as the last step of every successful change** when the user confirms the changes are good. Keep the file current with:
- New build/test/lint commands as they're added
- Architecture changes and new components
- Development workflow updates
- Any new conventions or patterns established