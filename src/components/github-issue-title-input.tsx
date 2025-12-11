import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter } from "./ui/HelpFooter.js";

interface GitHubIssueTitleInputProps {
  onSubmit: (title: string) => void;
  onBack: () => void;
  repoCount: number;
}

export const GitHubIssueTitleInput: React.FC<GitHubIssueTitleInputProps> = ({
  onSubmit,
  onBack,
  repoCount,
}) => {
  const [title, setTitle] = useState("Grading Feedback");

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.return) {
      if (title.trim()) {
        onSubmit(title.trim());
      }
      return;
    }

    if (key.backspace || key.delete) {
      setTitle((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setTitle((prev) => prev + input);
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="blue" bold>
        Create GitHub Issues
      </Text>
      <Text></Text>
      <Text>
        Creating issues for {repoCount} {repoCount === 1 ? "repository" : "repositories"}
      </Text>
      <Text></Text>
      <Text>Issue title:</Text>
      <Box
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        marginTop={1}
      >
        <Text color="white">{title}</Text>
        <Text color="cyan">_</Text>
      </Box>
      <Text></Text>
      <Text color="gray" dimColor>
        This title will be used for all issues created
      </Text>
      <Text></Text>
      <HelpFooter
        hints={[
          { keys: "Enter", action: "confirm" },
          { keys: "Esc", action: "back" },
        ]}
      />
    </Box>
  );
};
