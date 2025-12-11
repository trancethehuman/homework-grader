# Claude Agent SDK Integration

This directory contains the Claude Agent SDK integration for local repository grading.

## Quick Reference

**Package**: `@anthropic-ai/claude-agent-sdk`
**Minimum Node.js**: v18+
**Working Directory**: Set via `cwd` option

## Documentation Links

### Core SDK Documentation
- **[SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)** - Installation, basic usage
- **[TypeScript SDK](https://platform.claude.com/docs/en/agent-sdk/typescript)** - Full V1 API reference
- **[TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)** - Simplified session API

### Code Examples
- **[Hello World V2](https://github.com/anthropics/claude-agent-sdk-demos/tree/main/hello-world-v2)** - V2 API examples
- **[SDK Demos](https://github.com/anthropics/claude-agent-sdk-demos)** - Various example projects

## API Patterns

### V2 Session API (Primary - used for single repo grading)
```typescript
import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk';

await using session = unstable_v2_createSession({
  model: 'claude-sonnet-4-5-20250929',
  cwd: repoPath,
  permissionMode: 'bypassPermissions',
  tools: { type: 'preset', preset: 'claude_code' },
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  hooks: gradingHooks
});

await session.send(prompt);
for await (const msg of session.receive()) {
  if (msg.type === 'assistant') { /* handle response */ }
  if (msg.type === 'result') { /* handle final result */ }
}
```

### V1 Query API (Fallback for advanced features)
```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const q = query({
  prompt: gradingPrompt,
  options: {
    model: 'claude-sonnet-4-5-20250929',
    cwd: repoPath,
    permissionMode: 'bypassPermissions',
    hooks: gradingHooks
  }
});

for await (const msg of q) {
  // Handle messages
}
```

## Hooks

Hooks allow tracking tool usage and session lifecycle:

- `PreToolUse` - Before tool executes (can modify input)
- `PostToolUse` - After successful tool execution
- `PostToolUseFailure` - After tool failure
- `SessionStart` / `SessionEnd` - Session lifecycle
- `Notification` - System notifications

## Message Types

- `assistant` - Claude's responses
- `result` - Final result with usage stats
- `system` - Initialization info

## Configuration Options

- `cwd`: Repository path to analyze
- `model`: Model to use (e.g., 'claude-sonnet-4-5-20250929')
- `permissionMode`: 'bypassPermissions' for autonomous grading
- `tools`: { type: 'preset', preset: 'claude_code' } for built-in tools
- `outputFormat`: For structured JSON output
- `hooks`: Custom callbacks for tool events

## Our Usage Pattern

1. User selects Claude Agent as grading method
2. User selects model (Sonnet 4.5, Opus 4, Haiku 3.5)
3. User provides repository path
4. `ClaudeAgentService` creates V2 session with repo as working directory
5. Grading prompt is sent via `session.send()`
6. Real-time progress tracked via hooks
7. Results extracted from `result` message
