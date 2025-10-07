import { PROMPT as BUILD_YOUR_FIRST_AGENT } from "./markdown/build-your-first-agent.js";
import { PROMPT as MCP_CLIENT_IMPLEMENTATION } from "./markdown/mcp-client-implementation.js";
import { PROMPT as GRADER_CHUNK } from "./markdown/grader-chunk.js";
import { PROMPT as GRADER_FINAL } from "./markdown/grader-final.js";
import { FRAGMENT as SCHEMA_VALIDATION_RETRY } from "./markdown/fragments/schema-validation-retry.js";
import { FRAGMENT as JSON_FORMAT_RETRY } from "./markdown/fragments/json-format-retry.js";
import { FRAGMENT as GENERIC_RETRY } from "./markdown/fragments/generic-retry.js";

const PROMPTS: Record<string, string> = {
  "build-your-first-agent.ts": BUILD_YOUR_FIRST_AGENT,
  "mcp-client-implementation.ts": MCP_CLIENT_IMPLEMENTATION,
  "grader-chunk.ts": GRADER_CHUNK,
  "grader-final.ts": GRADER_FINAL,
};

const FRAGMENTS: Record<string, string> = {
  "schema-validation-retry.ts": SCHEMA_VALIDATION_RETRY,
  "json-format-retry.ts": JSON_FORMAT_RETRY,
  "generic-retry.ts": GENERIC_RETRY,
};

export function loadPromptFromFile(filename: string): string {
  const prompt = PROMPTS[filename];
  if (!prompt) {
    throw new Error(`Prompt not found: ${filename}`);
  }
  return prompt;
}

export function loadFragment(fragmentName: string): string {
  const fragment = FRAGMENTS[fragmentName];
  if (!fragment) {
    throw new Error(`Fragment not found: ${fragmentName}`);
  }
  return fragment;
}

export function chainPrompts(...prompts: string[]): string {
  return prompts.filter((p) => p.trim()).join("\n\n");
}

export function appendToPrompt(basePrompt: string, addition: string): string {
  return chainPrompts(basePrompt, addition);
}

export function clearPromptCache(): void {
  // No-op since we're using imports now, not file reading with cache
}
