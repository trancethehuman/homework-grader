import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const promptCache: Map<string, string> = new Map();

export function loadPromptFromFile(filename: string): string {
  if (promptCache.has(filename)) {
    return promptCache.get(filename)!;
  }

  try {
    const filePath = join(__dirname, "markdown", filename);
    const content = readFileSync(filePath, "utf-8");
    promptCache.set(filename, content);
    return content;
  } catch (error) {
    throw new Error(
      `Failed to load prompt from ${filename}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function loadFragment(fragmentName: string): string {
  return loadPromptFromFile(`fragments/${fragmentName}`);
}

export function chainPrompts(...prompts: string[]): string {
  return prompts.filter((p) => p.trim()).join("\n\n");
}

export function appendToPrompt(basePrompt: string, addition: string): string {
  return chainPrompts(basePrompt, addition);
}

export function clearPromptCache(): void {
  promptCache.clear();
}
