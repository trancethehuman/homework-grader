import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";

interface CodexStartingProps {
  repoPath: string;
}

export const CodexStarting: React.FC<CodexStartingProps> = ({ repoPath }) => {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Starting Codex{dots}
      </Text>
      <Text></Text>
      <Text color="green">✓ Repository path: {repoPath}</Text>
      <Text></Text>
      <Text dimColor>Initializing Codex grading system...</Text>
      <Text></Text>
      <Text color="yellow">⚠ Codex integration coming soon</Text>
      <Text dimColor>This is a placeholder screen for the Codex workflow</Text>
      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
