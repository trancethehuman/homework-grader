import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService, NotionDatabase } from "../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../lib/notion/oauth-client.js";
import { NotionTokenStorage } from "../lib/notion/notion-token-storage.js";
import { LoadingState, ErrorState, EmptyState } from "./ui/StateDisplays.js";

interface NotionDatabaseSelectorProps {
  onSelect: (databaseId: string, databaseTitle: string) => void;
  onBack?: () => void;
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
        await oauth.refreshIfPossible();

        const tokenStorage = new NotionTokenStorage();
        const token = tokenStorage.getToken();
        if (!token?.access_token) {
          setError("Not authenticated with Notion. Please authenticate first.");
          setIsLoading(false);
          return;
        }

        const notionService = new NotionService(token.access_token);
        const allDatabases = await notionService.getAllDatabases();

        setDatabases(allDatabases);
        setError(null);
        setIsLoading(false);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load Notion databases";
        setError(errorMessage);
        setIsLoading(false);
      }
    };

    loadDatabases();
  }, []);

  useInput((input, key) => {
    if (isLoading) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(databases.length - 1, prev + 1));
    } else if (key.return && databases.length > 0) {
      const selected = databases[selectedIndex];
      onSelect(selected.id, selected.title);
    } else if ((input === "b" || key.escape) && onBack) {
      onBack();
    }
  });

  if (isLoading) {
    return <LoadingState message="Loading Notion databases..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        showBackHint={!!onBack}
      />
    );
  }

  if (databases.length === 0) {
    return (
      <EmptyState
        message="No Notion databases found."
        hint="Please create a database in Notion first."
        showBackHint={!!onBack}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Notion Database
      </Text>
      <Text></Text>
      <Text dimColor>Choose a database to save your grading results:</Text>
      <Text></Text>

      <Box flexDirection="column">
        {databases.slice(0, 10).map((db, index) => (
          <Box key={db.id}>
            <Text color={index === selectedIndex ? "cyan" : "white"}>
              {index === selectedIndex ? "▸ " : "  "}
              {db.title}
            </Text>
          </Box>
        ))}
      </Box>

      <Text></Text>
      {databases.length > 10 && (
        <Text dimColor>Showing 10 of {databases.length} databases</Text>
      )}
      <Text dimColor>↑/↓: navigate | Enter: select{onBack ? " | b: back" : ""}</Text>
    </Box>
  );
};
