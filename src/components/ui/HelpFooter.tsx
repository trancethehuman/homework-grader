import React from "react";

export interface KeyHint {
  keys: string | readonly string[] | string[];
  action: string;
  condition?: boolean;
}

export interface HelpFooterProps {
  hints: KeyHint[];
  separator?: string;
}

export const HelpFooter: React.FC<HelpFooterProps> = () => {
  return null;
};

export const COMMON_HINTS = {
  navigate: { keys: "↑/↓", action: "navigate" },
  select: { keys: "Enter", action: "select" },
  back: { keys: "'b'", action: "back" },
  backEsc: { keys: ["'b'", "Escape"], action: "go back" },
  exit: { keys: "Ctrl+C", action: "exit" },
  search: { keys: "'s'", action: "search" },
  pages: { keys: "←/→", action: "pages" },
  grade: { keys: "'g'", action: "grade" },
  quickStart: { keys: "'q'", action: "quick start" },
  toggleDatabases: { keys: "'d'", action: "toggle databases" },
  skip: { keys: "'s'", action: "skip" },
  stop: { keys: "'x'", action: "stop" },
  abort: { keys: "'a'", action: "abort all" },
} as const;

export const createHelpHints = (
  ...hintConfigs: Array<KeyHint | keyof typeof COMMON_HINTS | [keyof typeof COMMON_HINTS, boolean]>
): KeyHint[] => {
  return hintConfigs.map((config) => {
    if (typeof config === "string") {
      return COMMON_HINTS[config];
    }
    if (Array.isArray(config)) {
      return { ...COMMON_HINTS[config[0]], condition: config[1] };
    }
    return config;
  });
};
