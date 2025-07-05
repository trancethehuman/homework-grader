# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a homework grading system repository with URL loading functionality for processing homework submissions from CSV files. The project is licensed under MIT License.

## Development Setup

### JavaScript
- Run: `npm start` (executes `node index.js`)
- Dependencies: `csv-parser` for CSV file parsing
- Example usage: `node example.js`

### Python
- No external dependencies required (uses standard library)
- Example usage: `python example.py`

## Architecture

The codebase currently includes:

### Core Components
- **URLLoader Class** (both JS and Python implementations)
  - `url-loader.js` - JavaScript implementation using csv-parser
  - `url_loader.py` - Python implementation using standard library
  - Loads URLs from CSV files with validation
  - Filters and deduplicates valid HTTP/HTTPS URLs

### Data Files
- `sample.csv` - Example CSV file containing name, website, and description columns
- Supports any CSV format with URL data in any column

### Examples
- `example.js` - Demonstrates JavaScript URLLoader usage
- `example.py` - Demonstrates Python URLLoader usage

### Key Features
- CSV file validation (file existence, .csv extension)
- URL validation (HTTP/HTTPS protocols only)
- Automatic deduplication of URLs
- Error handling for file operations

## Important Instructions

**ALWAYS update this CLAUDE.md file as the last step of every successful change** when the user confirms the changes are good. Keep the file current with:
- New build/test/lint commands as they're added
- Architecture changes and new components
- Development workflow updates
- Any new conventions or patterns established