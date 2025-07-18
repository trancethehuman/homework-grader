import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { NotionService } from "../../lib/notion/notion-service.js";
import { NotionFormatter } from "../../lib/notion/notion-formatter.js";

interface NotionContentViewerProps {
  pageId: string;
  pageTitle: string;
  onComplete: () => void;
}

export const NotionContentViewer: React.FC<NotionContentViewerProps> = ({
  pageId,
  pageTitle,
  onComplete,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<any>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const notionService = new NotionService();
        
        // Try to get page content first
        let pageContent;
        try {
          pageContent = await notionService.getPageContent(pageId);
        } catch (pageError) {
          // If it's a database, try to query it instead
          try {
            pageContent = await notionService.queryDatabase(pageId);
          } catch (dbError) {
            throw new Error(`Failed to fetch content: ${pageError instanceof Error ? pageError.message : pageError}`);
          }
        }

        setContent(pageContent);
        
        // Log the formatted content to console
        const formattedOutput = NotionFormatter.formatForConsole(pageContent);
        console.log("\n" + formattedOutput);
        
        // Also log the raw JSON for debugging (commented out by default)
        // console.log("\n" + "=".repeat(80));
        // console.log("RAW JSON DATA:");
        // console.log("=".repeat(80));
        // console.log(JSON.stringify(pageContent, null, 2));
        // console.log("=".repeat(80));
        
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch content";
        setError(errorMessage);
        console.error(`Error fetching Notion content for ${pageTitle}:`, err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [pageId, pageTitle]);

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Fetching Content...
        </Text>
        <Text></Text>
        <Text>Loading content for: {pageTitle}</Text>
        <Text dimColor>Page ID: {pageId}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          Error Fetching Content
        </Text>
        <Text></Text>
        <Text>{error}</Text>
        <Text></Text>
        <Text dimColor>
          Check the console for more details.
        </Text>
        <Text></Text>
        <Text dimColor>Press any key to continue...</Text>
      </Box>
    );
  }

  // Format the content for display
  const formatted = NotionFormatter.formatContent(content);
  const isDatabase = Array.isArray(content);
  const contentType = isDatabase ? "Database" : "Page";

  return (
    <Box flexDirection="column">
      <Text color="green" bold>
        ✓ Content Fetched Successfully
      </Text>
      <Text></Text>
      <Text>
        <Text bold>Title:</Text> {formatted.icon} {formatted.title}
      </Text>
      <Text>
        <Text bold>Type:</Text> {contentType}
      </Text>
      <Text>
        <Text bold>Summary:</Text> {formatted.summary}
      </Text>
      <Text>
        <Text bold>Blocks:</Text> {formatted.blocks.length}
      </Text>
      <Text>
        <Text bold>Last edited:</Text> {formatted.lastEditedTime}
      </Text>
      <Text></Text>
      <Text color="yellow">
        The formatted content has been logged to the console above.
      </Text>
      <Text></Text>
      <Text dimColor>
        Press any key to continue...
      </Text>
    </Box>
  );
};