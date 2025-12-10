import React from "react";
import { Text, Box } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface ParallelInstanceSelectorProps {
  onSubmit: (count: number) => void;
  onBack: () => void;
}

export const ParallelInstanceSelector: React.FC<ParallelInstanceSelectorProps> = ({
  onSubmit,
  onBack,
}) => {
  const validateCount = (value: string): { valid: boolean; message?: string } => {
    const trimmed = value.trim();

    if (trimmed === "") {
      return { valid: false, message: "Please enter a number" };
    }

    const num = parseInt(trimmed, 10);

    if (isNaN(num)) {
      return { valid: false, message: "Must be a valid number" };
    }

    if (num < 1) {
      return { valid: false, message: "Must be at least 1" };
    }

    return { valid: true };
  };

  const { input, error } = useTextInput({
    initialValue: "4",
    onSubmit: (value) => {
      const num = parseInt(value.trim(), 10);
      onSubmit(num);
    },
    onBack,
    validate: validateCount,
    allowBackWhenEmpty: true,
    filter: (char: string) => /[0-9]/.test(char),
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
    </Box>
  );
};
