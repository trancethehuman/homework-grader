import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService, NotionDatabase } from "../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../lib/notion/oauth-client.js";
import { ApiTimeoutHandler } from "../lib/notion/api-timeout-handler.js";

interface NotionDatabaseSelectorProps {
  onSelect: (databaseId: string, databaseTitle: string) => void;
  onBack: () => void;
}

export const NotionDatabaseSelector: React.FC<NotionDatabaseSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDatabases = async () => {
      try {
        setIsLoading(true);

        const oauth = new NotionOAuthClient();
        await ApiTimeoutHandler.withTimeout(
          async () => {
            await oauth.refreshIfPossible();
            return Promise.resolve();
          },
          {
            timeoutMs: 30000,
            retries: 1,
            operation: "Token Refresh",
          }
        );

        const token = await ApiTimeoutHandler.withTimeout(
          async () => {
            return await oauth.ensureAuthenticated();
          },
          {
            timeoutMs: 120000,
            retries: 1,
            operation: "OAuth Authentication",
          }
        );

        const notionService = new NotionService(token.access_token);

        const databasesData = await ApiTimeoutHandler.withTimeout(
          async () => {
            return await notionService.getAllDatabases();
          },
          {
            timeoutMs: 45000,
            retries: 1,
            operation: "Notion Database Loading",
          }
        );

        setDatabases(databasesData);
        setError(null);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to load Notion databases";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadDatabases();
  }, []);

  useInput((input, key) => {
    if (isLoading || error) return;

    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < databases.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (key.return && databases[selectedIndex]) {
      const db = databases[selectedIndex];
      onSelect(db.id, db.title);
    } else if ((input === "b" || key.escape) && onBack) {
      onBack();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Loading Notion Databases...
        </Text>
        <Box marginTop={1}>
          <Text dimColor>
            Connecting to your workspace and fetching databases...
          </Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          Error Loading Notion Databases
        </Text>
        <Text></Text>
        <Text>{error}</Text>
        <Text></Text>
        <Text dimColor>Press 'b' to go back</Text>
      </Box>
    );
  }

  if (databases.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          No Notion Databases Found
        </Text>
        <Text></Text>
        <Text>
          No databases were found that are accessible to your integration.
        </Text>
        <Text></Text>
        <Text dimColor>
          Make sure to share your Notion databases with the integration.
        </Text>
        <Text></Text>
        <Text dimColor>Press 'b' to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Notion Database for Grading Results
      </Text>
      <Text></Text>
      <Text>
        Found {databases.length} database{databases.length === 1 ? "" : "s"}{" "}
        accessible to your integration.
      </Text>
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select, 'b' to go back</Text>
      <Text></Text>

      {databases.map((db, index) => (
        <Box key={db.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={selectedIndex === index ? "blue" : "white"} bold={selectedIndex === index}>
              {selectedIndex === index ? "→ " : "  "}
              {db.title}
            </Text>
          </Box>
          <Box marginLeft={4}>
            <Text dimColor>
              Last edited: {new Date(db.lastEditedTime).toLocaleDateString()}
            </Text>
          </Box>
        </Box>
      ))}

      <Text></Text>
      <Text dimColor>Press Enter to select, 'b' to go back</Text>
    </Box>
  );
};
