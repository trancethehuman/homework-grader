import React from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";

interface CollaboratorConfirmProps {
  targetRepo: string;
  usernames: string[];
  onConfirm: () => void;
  onBack: () => void;
}

export const CollaboratorConfirm: React.FC<CollaboratorConfirmProps> = ({
  targetRepo,
  usernames,
  onConfirm,
  onBack,
}) => {
  const uniqueUsernames = [...new Set(usernames.map((u) => u.trim().toLowerCase()))];
  const duplicateCount = usernames.length - uniqueUsernames.length;

  useInput((input, key) => {
    if (key.return) {
      onConfirm();
    } else if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Confirm Adding Collaborators
      </Text>
      <Text dimColor>Repository: {targetRepo}</Text>
      <Text></Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Ready to add <Text bold color="cyan">{uniqueUsernames.length}</Text> unique users as collaborators
        </Text>
        {duplicateCount > 0 && (
          <Text dimColor>
            ({duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"} will be skipped)
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Preview (first 10 usernames):</Text>
        <Box flexDirection="column" marginLeft={2}>
          {uniqueUsernames.slice(0, 10).map((username) => (
            <Text key={username} color="white">
              - {username}
            </Text>
          ))}
          {uniqueUsernames.length > 10 && (
            <Text dimColor>... and {uniqueUsernames.length - 10} more</Text>
          )}
        </Box>
      </Box>

      <Text></Text>
      <Box flexDirection="row" gap={2}>
        <Text color="green">[Enter] Start adding collaborators</Text>
        <Text color="yellow">[Esc] Go back</Text>
      </Box>
      <Text></Text>
      <HelpFooter hints={createHelpHints("select", "backEsc")} />
    </Box>
  );
};
