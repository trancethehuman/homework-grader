export interface AIProvider {
  id: string;
  name: string;
  description: string;
  model: string;
  contextWindowTokens?: number;
  getModelInstance: () => Promise<any>;
}

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128000;

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "gemini",
    name: "Gemini 2.5 Flash Lite",
    description: "Google Gemini's fastest model",
    model: "gemini-2.5-flash-lite",
    contextWindowTokens: 128000,
    getModelInstance: async () => {
      const { google } = await import("@ai-sdk/google");
      return google("gemini-2.5-flash-lite");
    },
  },
  {
    id: "gemini-flash",
    name: "Gemini 2.5 Flash",
    description:
      "Google Gemini's standard flash model with larger context window",
    model: "gemini-2.5-flash",
    contextWindowTokens: 1000000,
    getModelInstance: async () => {
      const { google } = await import("@ai-sdk/google");
      return google("gemini-2.5-flash");
    },
  },
  {
    id: "gemini-pro",
    name: "Gemini 2.5 Pro",
    description: "Google Gemini's most capable model",
    model: "gemini-2.5-pro",
    contextWindowTokens: 1048576,
    getModelInstance: async () => {
      const { google } = await import("@ai-sdk/google");
      return google("gemini-2.5-pro");
    },
  },
  {
    id: "openai",
    name: "OpenAI GPT-4.1",
    description: "OpenAI's GPT-4.1 model",
    model: "gpt-4.1",
    contextWindowTokens: 2000000,
    getModelInstance: async () => {
      const { openai } = await import("@ai-sdk/openai");
      return openai("gpt-4.1");
    },
  },
  {
    id: "gpt-5",
    name: "OpenAI GPT-5",
    description: "OpenAI's GPT-5 model with advanced reasoning capabilities",
    model: "gpt-5",
    contextWindowTokens: 272000,
    getModelInstance: async () => {
      const { openai } = await import("@ai-sdk/openai");
      return openai("gpt-5");
    },
  },
  {
    id: "gpt-5-codex",
    name: "OpenAI GPT-5 Codex",
    description: "OpenAI's GPT-5 model optimized for agentic coding",
    model: "gpt-5-codex",
    contextWindowTokens: 400000,
    getModelInstance: async () => {
      const { openai } = await import("@ai-sdk/openai");
      return openai("gpt-5-codex");
    },
  },
  {
    id: "claude",
    name: "Claude Sonnet 4",
    description: "Anthropic's Claude Sonnet 4 model",
    model: "claude-sonnet-4-20250514",
    contextWindowTokens: 200000,
    getModelInstance: async () => {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic("claude-sonnet-4-20250514");
    },
  },
];

export const DEFAULT_PROVIDER = AI_PROVIDERS[0];

export interface ComputerUseModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  description: string;
}

export const COMPUTER_USE_MODELS: ComputerUseModel[] = [
  {
    id: "openai-computer-use",
    name: "OpenAI Computer Use Preview",
    provider: "openai",
    model: "computer-use-preview",
    description: "OpenAI's latest computer use model",
  },
  {
    id: "openai-computer-use-2025",
    name: "OpenAI Computer Use Preview 2025",
    provider: "openai",
    model: "computer-use-preview-2025-03-11",
    description: "OpenAI's enhanced computer use model",
  },
  {
    id: "claude-sonnet-latest",
    name: "Claude 3.7 Sonnet Latest",
    provider: "anthropic",
    model: "claude-3-7-sonnet-latest",
    description: "Anthropic's latest Sonnet model",
  },
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    description: "Anthropic's Sonnet 4 model",
  },
];

export const DEFAULT_COMPUTER_USE_MODEL = COMPUTER_USE_MODELS[0];
