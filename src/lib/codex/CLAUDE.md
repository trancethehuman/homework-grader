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
