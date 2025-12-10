import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";

interface CollaboratorUsernameInputProps {
  onComplete: (usernames: string[]) => void;
  onBack: () => void;
  targetRepo: string;
}

const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export const CollaboratorUsernameInput: React.FC<CollaboratorUsernameInputProps> = ({
  onComplete,
  onBack,
  targetRepo,
}) => {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const validateUsernames = (usernames: string[]): { valid: string[]; invalid: string[] } => {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const username of usernames) {
      const trimmed = username.trim();
      if (!trimmed) continue;

      if (GITHUB_USERNAME_REGEX.test(trimmed)) {
        valid.push(trimmed);
      } else {
        invalid.push(trimmed);
      }
    }

    return { valid, invalid };
  };

  useInput((inputChar, key) => {
    if (key.return && input.trim()) {
      const usernames = input.split(",").map((u) => u.trim()).filter(Boolean);
      const { valid, invalid } = validateUsernames(usernames);

      if (invalid.length > 0) {
        setError(`Invalid username(s): ${invalid.join(", ")}`);
        return;
      }

      if (valid.length === 0) {
        setError("Please enter at least one valid username");
        return;
      }

      onComplete(valid);
      return;
    }

    if (key.escape && !input) {
      onBack();
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
      return;
    }

    if (inputChar && inputChar.length === 1 && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Enter GitHub Usernames
      </Text>
      <Text dimColor>Adding collaborators to: {targetRepo}</Text>
      <Text></Text>

      <Text>Enter usernames separated by commas:</Text>
      <Text dimColor>Example: user1, user2, user3</Text>
      <Text></Text>

      <Box
        borderStyle="single"
        borderColor={error ? "red" : "blue"}
        paddingX={1}
        flexGrow={1}
      >
        <Text color="white">{input}</Text>
        <Text color="blue">█</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Text></Text>
      <HelpFooter hints={createHelpHints("select", "backEsc")} />
    </Box>
  );
};
