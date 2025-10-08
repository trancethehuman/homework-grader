import React from "react";
import { Text, Box } from "ink";
import Spinner from "ink-spinner";

interface NotionDataLoadingProps {
  title?: string;
  message?: string;
}

export const NotionDataLoading: React.FC<NotionDataLoadingProps> = ({
  title = "Loading Notion Data...",
  message = "This may take a moment while we fetch your data...",
}) => {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text bold color="blue">
        {title}
      </Text>
      <Box marginTop={1} alignItems="center">
        <Text color="green">
          <Spinner type="earth" />
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{message}</Text>
      </Box>
    </Box>
  );
};
