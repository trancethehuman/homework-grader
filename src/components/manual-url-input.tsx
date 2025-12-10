import React from "react";
import { Text, Box } from "ink";
import { useTextInput } from "../hooks/useTextInput.js";

interface ManualUrlInputProps {
  onComplete: (urls: string[]) => void;
  onBack: () => void;
}

export const ManualUrlInput: React.FC<ManualUrlInputProps> = ({
  onComplete,
  onBack,
}) => {
  const validateUrls = (value: string): { valid: boolean; message?: string } => {
    const trimmedInput = value.trim();
    if (!trimmedInput) {
      return { valid: false, message: "Please enter at least one GitHub URL" };
    }

    const urls = trimmedInput
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      return { valid: false, message: "Please enter at least one valid GitHub URL" };
    }

    const invalidUrls = urls.filter((url) => {
      try {
        const urlObj = new URL(url);
        return !urlObj.hostname.includes("github.com");
      } catch {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      return {
        valid: false,
        message: `Invalid GitHub URLs: ${invalidUrls.slice(0, 3).join(", ")}${
          invalidUrls.length > 3 ? "..." : ""
        }`,
      };
    }

    return { valid: true };
  };

  const { input, error } = useTextInput({
    onSubmit: (value) => {
      const urls = value
        .trim()
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
      onComplete(urls);
    },
    onBack,
    validate: validateUrls,
    allowBackWhenEmpty: true,
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
