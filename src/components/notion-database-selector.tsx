import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService, NotionDatabase } from "../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../lib/notion/oauth-client.js";
import { NotionTokenStorage } from "../lib/notion/notion-token-storage.js";
import { LoadingState, ErrorState, EmptyState } from "./ui/StateDisplays.js";

interface NotionDatabaseSelectorProps {
  onSelect: (databaseId: string, databaseTitle: string) => void;
  onBack?: () => void;
  onAuthenticationRequired?: () => void;
}

export const NotionDatabaseSelector: React.FC<NotionDatabaseSelectorProps> = ({
  onSelect,
  onBack,
  onAuthenticationRequired,
}) => {
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusedButton, setFocusedButton] = useState<"list" | "back" | "reauth">("list");

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

  const handleReauth = () => {
    if (onAuthenticationRequired) {
      const tokenStorage = new NotionTokenStorage();
      tokenStorage.clearToken();
      onAuthenticationRequired();
    }
  };

  useInput((input, key) => {
    if (isLoading) return;

    if (focusedButton === "list") {
      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        if (selectedIndex < databases.length - 1) {
          setSelectedIndex((prev) => prev + 1);
        } else {
          if (onBack) {
            setFocusedButton("back");
          } else if (onAuthenticationRequired) {
            setFocusedButton("reauth");
          }
        }
      } else if (key.return && databases.length > 0) {
        const selected = databases[selectedIndex];
        onSelect(selected.id, selected.title);
      } else if (key.escape && onBack) {
        onBack();
      }
    } else if (focusedButton === "back") {
      if (key.upArrow) {
        setFocusedButton("list");
      } else if (key.rightArrow && onAuthenticationRequired) {
        setFocusedButton("reauth");
      } else if (key.return && onBack) {
        onBack();
      } else if (key.escape) {
        onBack?.();
      }
    } else if (focusedButton === "reauth") {
      if (key.upArrow) {
        setFocusedButton("list");
      } else if (key.leftArrow && onBack) {
        setFocusedButton("back");
      } else if (key.return) {
        handleReauth();
      } else if (key.escape && onBack) {
        onBack();
      }
    }
  });

  if (isLoading) {
    return <LoadingState message="Loading Notion databases..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={error}
      />
    );
  }

  if (databases.length === 0) {
    return (
      <EmptyState
        message="No Notion databases found."
        hint="Please create a database in Notion first."
      />
    );
  }

  const isListFocused = focusedButton === "list";
  const isBackFocused = focusedButton === "back";
  const isReauthFocused = focusedButton === "reauth";

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
            <Text color={isListFocused && index === selectedIndex ? "cyan" : "white"} bold={isListFocused && index === selectedIndex}>
              {db.title}
            </Text>
          </Box>
        ))}
      </Box>

      {databases.length > 10 && (
        <>
          <Text></Text>
          <Text dimColor>Showing 10 of {databases.length} databases</Text>
        </>
      )}

      <Text></Text>
      <Box justifyContent="space-between">
        {onBack ? (
          <Box>
            <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
              back
            </Text>
          </Box>
        ) : (
          <Box />
        )}
        {onAuthenticationRequired && (
          <Box>
            <Text color={isReauthFocused ? "blue" : "gray"} bold={isReauthFocused}>
              + Add more pages
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
