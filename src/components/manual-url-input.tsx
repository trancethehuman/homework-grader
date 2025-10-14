import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

interface ManualUrlInputProps {
  onComplete: (urls: string[]) => void;
  onBack: () => void;
}

export const ManualUrlInput: React.FC<ManualUrlInputProps> = ({
  onComplete,
  onBack,
}) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.return) {
      const trimmedInput = input.trim();
      if (!trimmedInput) {
        setError("Please enter at least one GitHub URL");
        return;
      }

      // Parse comma-separated URLs
      const urls = trimmedInput
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      if (urls.length === 0) {
        setError("Please enter at least one valid GitHub URL");
        return;
      }

      // Validate URLs
      const invalidUrls = urls.filter((url) => {
        try {
          const urlObj = new URL(url);
          return !urlObj.hostname.includes("github.com");
        } catch {
          return true;
        }
      });

      if (invalidUrls.length > 0) {
        setError(
          `Invalid GitHub URLs: ${invalidUrls.slice(0, 3).join(", ")}${
            invalidUrls.length > 3 ? "..." : ""
          }`
        );
        return;
      }

      onComplete(urls);
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
    } else if (input.length === 0 && (char === "b" || key.escape)) {
      onBack();
    } else if (char && !key.ctrl && !key.meta) {
      setInput((prev) => prev + char);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Manual URL Input
      </Text>
      <Text></Text>
      <Text>Enter GitHub repository URLs (comma-separated):</Text>
      <Text dimColor>
        Example: https://github.com/user/repo1, https://github.com/user/repo2
      </Text>
      <Text></Text>

      <Box>
        <Text color="green">URLs: </Text>
        <Text>{input || "_"}</Text>
      </Box>

      {error && (
        <>
          <Text></Text>
          <Text color="red">Error: {error}</Text>
        </>
      )}

      <Text></Text>
      <Text dimColor>Press Enter to continue</Text>
      <Text dimColor>Press 'b' or Escape (when input is empty) to go back</Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
