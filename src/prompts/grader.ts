import { BUILD_YOUR_FIRST_AGENT_PROMPT } from "../consts/grading-prompts.js";
import {
  loadPromptFromFile,
  loadFragment,
  chainPrompts,
  appendToPrompt,
} from "./prompt-loader.js";

// Keep legacy export for backward compatibility
export const PROMPT_GRADER = BUILD_YOUR_FIRST_AGENT_PROMPT;

export const PROMPT_GRADER_CHUNK = loadPromptFromFile("grader-chunk.ts");

export const PROMPT_GRADER_FINAL = loadPromptFromFile("grader-final.ts");

// Export fragment helpers for prompt composition
export const RETRY_FRAGMENTS = {
  SCHEMA_VALIDATION: loadFragment("schema-validation-retry.ts"),
  JSON_FORMAT: loadFragment("json-format-retry.ts"),
  GENERIC: loadFragment("generic-retry.ts"),
};

// Export chaining utilities for external use
export { chainPrompts, appendToPrompt };
