# Codex Integration

This directory contains the Codex SDK integration for local repository grading.

## Quick Reference

**Package**: `@openai/codex-sdk` (already installed)
**Minimum Node.js**: v18+
**Working Directory**: Requires Git repository (use `skipGitRepoCheck: true` to bypass)

## Documentation Links

### Core SDK Documentation
- **[Main SDK Docs](https://developers.openai.com/codex/sdk/)** - Installation, basic usage, and overview
- **[TypeScript Library Docs](https://developers.openai.com/codex/sdk/#typescript-library)** - TypeScript-specific patterns, initialization, and thread management

### Code Examples
- **[Basic Streaming Example](https://github.com/openai/codex/blob/main/sdk/typescript/samples/basic_streaming.ts)** - Use for real-time event handling and displaying progress
- **[Structured Output with Zod](https://github.com/openai/codex/blob/main/sdk/typescript/samples/structured_output_zod.ts)** - Use for validated JSON responses
- **[TypeScript SDK Source](https://github.com/openai/codex/tree/main/sdk/typescript)** - Full SDK reference including advanced features

## Common Patterns

### Basic Initialization
```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
```

### Streaming Events (Recommended for CLI)
```typescript
const { events } = await thread.runStreamed("Analyze this repository");

for await (const event of events) {
  if (event.type === "item.updated") {
    // Display real-time updates
  } else if (event.type === "item.completed") {
    // Handle completion
  }
}
```

### Structured Output with Zod
```typescript
import z from "zod";
import zodToJsonSchema from "zod-to-json-schema";

const schema = z.object({
  grade: z.number(),
  feedback: z.string(),
});

const turn = await thread.run("Grade this code", {
  outputSchema: zodToJsonSchema(schema, { target: "openAi" }),
});
```

## Event Types

- `item.updated` - Partial response updates (streaming)
- `item.completed` - Full item completion
- `turn.completed` - Entire turn finished (includes token usage)

## Configuration Options

```typescript
const codex = new Codex({
  skipGitRepoCheck: true,  // Optional: Skip Git repo validation
});
```

## Our Usage Pattern

In this project:
1. User selects local grading with Codex
2. User provides repository path (or uses current directory)
3. `CodexService` initializes Codex with the path
4. Start streaming thread for grading analysis
5. Display real-time progress in `CodexStarting` component
6. Handle completion and display results

## Grading Schema for Notion Integration

The project uses a structured output schema to ensure consistent grading format that can be saved to Notion databases.

### Schema Definition (`grading-schema.ts`)

```typescript
export const CODEX_GRADING_SCHEMA = {
  type: "object",
  properties: {
    repo_explained: {
      type: "string",
      description: "A concise summary (2-3 sentences) explaining what the repository accomplishes"
    },
    developer_feedback: {
      type: "string",
      description: "Detailed actionable feedback in markdown format"
    }
  },
  required: ["repo_explained", "developer_feedback"],
  additionalProperties: false
} as const;
```

### Batch Grading with Notion Integration

When using `ParallelCodexService` for batch grading:

1. **Structured Output**: Schema is passed to `runParallelGrading()` method
2. **Response Format**: Codex returns JSON with `repo_explained` and `developer_feedback` fields
3. **Post-Grading Workflow**: User is prompted to save results to Notion
4. **Database Selection**: Interactive selector shows available Notion databases
5. **Schema Management**: Automatically creates required Notion columns
6. **Data Transform**: Results are converted to Notion-compatible format
7. **Conflict Handling**: Detects and handles existing data in Notion

### Notion Column Mapping

| Codex Field | Notion Column | Description |
|-------------|---------------|-------------|
| `repo_explained` | Repository Summary | Short explanation of what repo does |
| `developer_feedback` | Developer Feedback | Detailed feedback and suggestions |
| (metadata) | Graded At | Timestamp of grading |
| (metadata) | GitHub URL | Link to repository |

### Usage Example

```typescript
// In ParallelCodexService
const results = await service.runParallelGrading(
  prompt,
  onRepoStart,
  onRepoComplete,
  onRepoEvent,
  CODEX_GRADING_SCHEMA  // Pass schema for structured output
);

// Results include structured output
results.results.forEach(result => {
  if (result.structuredOutput) {
    console.log(result.structuredOutput.repo_explained);
    console.log(result.structuredOutput.developer_feedback);
  }
});
```
