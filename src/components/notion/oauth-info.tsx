import React from "react";
import { Box, Text, useInput } from "ink";

interface NotionOAuthInfoProps {
  onContinue: () => void;
  onBack: () => void;
}

export const NotionOAuthInfo: React.FC<NotionOAuthInfoProps> = ({
  onContinue,
  onBack,
}) => {
  useInput((input, key) => {
    if (key.return) {
      onContinue();
    } else if (input === "b" || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Connect to Notion
      </Text>
      <Text></Text>
      <Text>
        To access your Notion pages and databases, we’ll open a browser window
        for a one-time authorization.
      </Text>
      <Text></Text>
      <Text dimColor>
        We use a secure proxy so your Notion credentials are never stored in the
        CLI.
      </Text>
      <Text></Text>
      <Text color="green">
        Press Enter to open the Notion authorization page
      </Text>
      <Text color="red">Press 'b' to go back</Text>
    </Box>
  );
};
