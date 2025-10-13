import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import * as fs from "fs";
import * as path from "path";

interface LocalRepoPathInputProps {
  onSubmit: (repoPath: string) => void;
  onBack: () => void;
  currentDirectory: string;
}

export const LocalRepoPathInput: React.FC<LocalRepoPathInputProps> = ({
  onSubmit,
  onBack,
  currentDirectory,
}) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validatePath = (inputPath: string): { valid: boolean; error?: string } => {
    if (!inputPath.trim()) {
      return { valid: false, error: "Path cannot be empty" };
    }

    const resolvedPath = path.resolve(inputPath);

    if (!fs.existsSync(resolvedPath)) {
      return { valid: false, error: "Path does not exist" };
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: "Path must be a directory" };
    }

    return { valid: true };
  };

  useInput((char, key) => {
    if (key.return) {
      const validation = validatePath(input);
      if (validation.valid) {
        onSubmit(path.resolve(input));
      } else {
        setError(validation.error || "Invalid path");
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
    } else if (key.escape || (char === "b" && input === "")) {
      onBack();
    } else if (char && !key.ctrl) {
      setInput((prev) => prev + char);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Enter Local Repository Path
      </Text>
      <Text></Text>
      <Text>Enter the path to your local repository:</Text>
      <Text dimColor>Current directory: {currentDirectory}</Text>
      <Text></Text>

      <Box>
        <Text color="cyan">Path: </Text>
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
      <Text dimColor>Tip: You can use relative paths (e.g., ./my-repo or ../other-repo)</Text>
      <Text dimColor>Press Enter to continue, 'b' to go back (when input is empty)</Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
