import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

interface ParallelInstanceSelectorProps {
  onSubmit: (count: number) => void;
  onBack: () => void;
}

export const ParallelInstanceSelector: React.FC<ParallelInstanceSelectorProps> = ({
  onSubmit,
  onBack,
}) => {
  const [input, setInput] = useState("4");
  const [error, setError] = useState<string | null>(null);

  const validateCount = (value: string): { valid: boolean; error?: string; count?: number } => {
    const trimmed = value.trim();

    if (trimmed === "") {
      return { valid: false, error: "Please enter a number" };
    }

    const num = parseInt(trimmed, 10);

    if (isNaN(num)) {
      return { valid: false, error: "Must be a valid number" };
    }

    if (num < 1) {
      return { valid: false, error: "Must be at least 1" };
    }

    return { valid: true, count: num };
  };

  useInput((char, key) => {
    if (key.return) {
      const validation = validateCount(input);
      if (validation.valid && validation.count) {
        onSubmit(validation.count);
      } else {
        setError(validation.error || "Invalid input");
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
    } else if (key.escape || (char === "b" && input === "")) {
      onBack();
    } else if (char && !key.ctrl && /[0-9]/.test(char)) {
      setInput((prev) => prev + char);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Parallel Codex Test Configuration
      </Text>
      <Text></Text>
      <Text>How many repositories to test in parallel?</Text>
      <Text></Text>

      <Box>
        <Text color="cyan">Count: </Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>

      {error && (
        <>
          <Text></Text>
          <Text color="red">✗ {error}</Text>
        </>
      )}

      <Text></Text>
      <Text dimColor>Tip: 1-4 instances recommended for most machines</Text>
      <Text dimColor>     Higher counts may cause significant CPU/memory usage</Text>
      <Text dimColor>     No upper limit - choose based on your machine's capabilities</Text>
      <Text></Text>
      <Text dimColor>Press Enter to continue, 'b' to go back (when input is empty)</Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
