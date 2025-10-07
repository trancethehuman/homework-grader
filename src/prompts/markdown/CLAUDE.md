# Prompt System Rules

## Structure
- Main prompts: `*.md` files in this directory
- Reusable fragments: `fragments/*.md`
- Loader: `../prompt-loader.ts`

## Usage
```typescript
// Load prompts
import { loadPromptFromFile, loadFragment } from '../prompt-loader.js';
const prompt = loadPromptFromFile('build-your-first-agent.md');
const fragment = loadFragment('schema-validation-retry.md');

// Chain prompts
import { appendToPrompt, RETRY_FRAGMENTS } from '../grader.js';
const enhanced = appendToPrompt(basePrompt, RETRY_FRAGMENTS.GENERIC);
```

## Files
- `build-your-first-agent.md` - Main grading prompt
- `grader-chunk.md` - Chunk processing (uses `{CHUNK_INDEX}`, `{TOTAL_CHUNKS}`)
- `grader-final.md` - Final aggregation
- `fragments/schema-validation-retry.md` - Schema error retry
- `fragments/json-format-retry.md` - JSON error retry
- `fragments/generic-retry.md` - Generic retry

## Rules
- Edit prompts in markdown, not TypeScript
- Use fragments to avoid repetition
- All prompts are cached after first load
- Template variables replaced at runtime with `.replace()`
