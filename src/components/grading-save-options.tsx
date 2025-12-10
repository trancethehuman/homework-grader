import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { GradingResult } from "../lib/utils/file-saver.js";
import { GradingDatabaseService } from "../lib/notion/grading-database-service.js";
import { NotionService } from "../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../lib/notion/oauth-client.js";
import { HelpFooter } from "./ui/HelpFooter.js";

export type SaveOption = "file" | "original-database" | "new-database" | "skip";

interface GradingSaveOptionsProps {
  gradingResults: GradingResult[];
  originalDatabaseId?: string;
  onOptionSelected: (option: SaveOption, databaseId?: string) => void;
  onError: (error: string) => void;
}

export const GradingSaveOptions: React.FC<GradingSaveOptionsProps> = ({
  gradingResults,
  originalDatabaseId,
  onOptionSelected,
  onError,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [newDatabaseTitle, setNewDatabaseTitle] = useState("");
  const [isCreatingDatabase, setIsCreatingDatabase] = useState(false);
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [originalDatabaseInfo, setOriginalDatabaseInfo] = useState<{
    title: string;
    hasGradingSchema: boolean;
    missingProperties: string[];
  } | null>(null);

  const availableOptions: Array<{
    key: SaveOption;
    label: string;
    description: string;
  }> = [
    {
      key: "file",
      label: "Save to files (JSON format)",
      description: "Continue with existing file-based saving",
    },
  ];

  // Add database options if we have a Notion integration
  if (originalDatabaseId) {
    availableOptions.push({
      key: "original-database",
      label: `Save to original Notion database`,
      description: originalDatabaseInfo
        ? `"${originalDatabaseInfo.title}"${
            !originalDatabaseInfo.hasGradingSchema
              ? " (will add grading columns)"
              : ""
          }`
        : "Loading database info...",
    });
  }

  availableOptions.push(
    {
      key: "new-database",
      label: "Create new Notion database (requires parent page)",
      description:
        "Note: Not currently supported without selecting a parent page",
    },
    {
      key: "skip",
      label: "Skip saving (files already saved)",
      description: "Continue without additional saving",
    }
  );

  // Load original database info if available
  useEffect(() => {
    const loadDatabaseInfo = async () => {
      if (originalDatabaseId) {
        try {
          const oauth = new NotionOAuthClient();
          await oauth.ensureAuthenticated();
          const service = new GradingDatabaseService();
          const info = await service.getDatabaseInfo(originalDatabaseId);
          setOriginalDatabaseInfo(info);
        } catch (error) {
          console.warn("Could not load original database info:", error);
        }
      }
    };

    loadDatabaseInfo();
  }, [originalDatabaseId]);

  useInput((input, key) => {
    if (showTitleInput) {
      if (key.return) {
        handleCreateNewDatabase();
      } else if (key.backspace || key.delete) {
        setNewDatabaseTitle((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setNewDatabaseTitle((prev) => prev + input);
      }
      return;
    }

    if (isCreatingDatabase) return;

    if (key.upArrow && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    } else if (key.downArrow && selectedIndex < availableOptions.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    } else if (key.return) {
      const selected = availableOptions[selectedIndex];
      if (selected.key === "new-database") {
        const defaultTitle = `Homework Grading Results - ${
          new Date().toISOString().split("T")[0]
        }`;
        setNewDatabaseTitle(defaultTitle);
        setShowTitleInput(true);
      } else {
        onOptionSelected(selected.key, originalDatabaseId);
      }
    }
  });

  const handleCreateNewDatabase = async () => {
    if (!newDatabaseTitle.trim()) {
      onError("Database title cannot be empty");
      return;
    }

    setIsCreatingDatabase(true);
    setShowTitleInput(false);

    try {
      // For now, we'll show an error message since creating new databases requires a parent page
      onError(
        "Creating new databases requires selecting a parent page from your Notion workspace. Please use the 'Save to original database' option if available, or create a database manually in Notion first."
      );
      setIsCreatingDatabase(false);
      setShowTitleInput(false);
    } catch (error: any) {
      onError(`Failed to create database: ${error.message}`);
      setIsCreatingDatabase(false);
      setShowTitleInput(false);
    }
  };

  if (isCreatingDatabase) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">
          Creating Notion database "{newDatabaseTitle}"...
        </Text>
      </Box>
    );
  }

  if (showTitleInput) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green" bold>
          Create New Notion Database
        </Text>
        <Text></Text>
        <Text>Database title:</Text>
        <Text color="cyan">
          {newDatabaseTitle}
          <Text color="gray">_</Text>
        </Text>
        <Text></Text>
        <Text color="gray" dimColor>
          Press Enter to create, or edit the title above
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>
         Grading completed for {gradingResults.length} repositories!
      </Text>
      <Text color="gray" dimColor>
         Usage logged to ~/.cli-agents-fleet/usage-log.json
      </Text>
      <Text></Text>
      <Text>How would you like to save the results?</Text>
      <Text></Text>

      {availableOptions.map((option, index) => (
        <Box key={option.key} marginY={0}>
          <Text color={index === selectedIndex ? "cyan" : "white"} bold={index === selectedIndex}>
            {option.label}
          </Text>
        </Box>
      ))}

      <Text></Text>
      {availableOptions[selectedIndex] && (
        <Text color="gray" dimColor>
          {availableOptions[selectedIndex].description}
        </Text>
      )}
      <Text></Text>
      <HelpFooter
        hints={[
          { keys: "↑/↓", action: "navigate" },
          { keys: "Enter", action: "select" },
        ]}
      />
    </Box>
  );
};
