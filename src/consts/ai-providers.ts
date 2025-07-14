export interface AIProvider {
  id: string;
  name: string;
  description: string;
  model: string;
  getModelInstance: () => Promise<any>;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "openai",
    name: "OpenAI GPT-4.1",
    description: "OpenAI's latest GPT-4.1 model",
    model: "gpt-4.1",
    getModelInstance: async () => {
      const { openai } = await import("@ai-sdk/openai");
      return openai("gpt-4.1");
    },
  },
  {
    id: "claude",
    name: "Claude Sonnet 4",
    description: "Anthropic's Claude Sonnet 4 model",
    model: "claude-sonnet-4-20250514",
    getModelInstance: async () => {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic("claude-sonnet-4-20250514");
    },
  },
];

export const DEFAULT_PROVIDER = AI_PROVIDERS[0];