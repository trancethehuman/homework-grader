# Prompt System Rules

## Structure
- Main prompts: `*.ts` files in `markdown/` directory (exported as template literals)
- Reusable fragments: `markdown/fragments/*.ts`
- Loader: `prompt-loader.ts` (imports and returns prompts)

## Usage
```typescript
// Load prompts
import { loadPromptFromFile, loadFragment } from './prompt-loader.js';
const prompt = loadPromptFromFile('build-your-first-agent.ts');
const fragment = loadFragment('schema-validation-retry.ts');

// Chain prompts
import { appendToPrompt, RETRY_FRAGMENTS } from './grader.js';
const enhanced = appendToPrompt(basePrompt, RETRY_FRAGMENTS.GENERIC);
```

## Files
- `build-your-first-agent.ts` - Main grading prompt
- `mcp-client-implementation.ts` - MCP client evaluation with AI SDK patterns
- `grader-chunk.ts` - Chunk processing (uses `{CHUNK_INDEX}`, `{TOTAL_CHUNKS}`)
- `grader-final.ts` - Final aggregation
- `fragments/schema-validation-retry.ts` - Schema error retry
- `fragments/json-format-retry.ts` - JSON error retry
- `fragments/generic-retry.ts` - Generic retry

## Rules
- Edit prompts as template literals in TypeScript files
- Use fragments to avoid repetition
- Template variables replaced at runtime with `.replace()`
- No file reading - all prompts imported as modules
