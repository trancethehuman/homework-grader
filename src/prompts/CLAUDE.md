# Prompt System Rules

## Structure
- Main prompts: `*.ts` files in `content/` directory (exported as template literals)
- Reusable fragments: `content/fragments/*.ts`
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
- `build-your-first-agent.ts` - Main grading prompt (uses shared fragments)
- `mcp-client-implementation.ts` - MCP client evaluation with AI SDK patterns (uses shared fragments + MCP checklist)
- `grader-chunk.ts` - Chunk processing (uses `{CHUNK_INDEX}`, `{TOTAL_CHUNKS}`)
- `grader-final.ts` - Final aggregation
- `fragments/output-structure.ts` - Common output structure for REPO_EXPLAINED
- `fragments/feedback-structure.ts` - Common feedback structure (3 paragraphs)
- `fragments/format-requirements.ts` - Shared formatting requirements
- `fragments/general-guidelines.ts` - Common guidelines for all prompts
- `fragments/mcp-evaluation-checklist.ts` - Comprehensive MCP implementation checklist
- `fragments/schema-validation-retry.ts` - Schema error retry
- `fragments/json-format-retry.ts` - JSON error retry
- `fragments/generic-retry.ts` - Generic retry

## Rules
- Edit prompts as template literals in TypeScript files
- Use fragments to avoid repetition
- Template variables replaced at runtime with `.replace()`
- No file reading - all prompts imported as modules
