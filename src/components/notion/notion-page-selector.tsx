import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService, NotionPage, NotionDatabase } from "../../lib/notion/notion-service.js";

interface NotionPageSelectorProps {
  onSelect: (pageId: string, pageTitle: string) => void;
  onError: (error: string) => void;
}

export const NotionPageSelector: React.FC<NotionPageSelectorProps> = ({
  onSelect,
  onError,
}) => {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingDatabases, setShowingDatabases] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 10;

  const allItems = showingDatabases ? databases : [...pages, ...databases];

  useEffect(() => {
    const loadNotionData = async () => {
      try {
        setIsLoading(true);
        const notionService = new NotionService();
        
        const [pagesData, databasesData] = await Promise.all([
          notionService.getAllPages(),
          notionService.getAllDatabases(),
        ]);

        setPages(pagesData);
        setDatabases(databasesData);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load Notion data";
        setError(errorMessage);
        onError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotionData();
  }, [onError]);

  useInput((input, key) => {
    if (isLoading || error) return;

    const totalPages = Math.ceil(allItems.length / itemsPerPage);
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);

    if (key.upArrow) {
      setSelectedIndex((prev) => {
        const newIndex = Math.max(0, prev - 1);
        // If we go to the previous page
        if (newIndex < startIndex && currentPage > 0) {
          setCurrentPage(currentPage - 1);
          return newIndex;
        }
        return newIndex;
      });
    } else if (key.downArrow) {
      setSelectedIndex((prev) => {
        const newIndex = Math.min(allItems.length - 1, prev + 1);
        // If we go to the next page
        if (newIndex >= endIndex && currentPage < totalPages - 1) {
          setCurrentPage(currentPage + 1);
          return newIndex;
        }
        return newIndex;
      });
    } else if (key.leftArrow && currentPage > 0) {
      setCurrentPage(currentPage - 1);
      setSelectedIndex(Math.max(0, (currentPage - 1) * itemsPerPage));
    } else if (key.rightArrow && currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
      setSelectedIndex(Math.min(allItems.length - 1, (currentPage + 1) * itemsPerPage));
    } else if (key.return) {
      if (allItems[selectedIndex]) {
        const item = allItems[selectedIndex];
        onSelect(item.id, item.title);
      }
    } else if (input === "d") {
      setShowingDatabases(!showingDatabases);
      setSelectedIndex(0);
      setCurrentPage(0);
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Loading Notion Data...
        </Text>
        <Text></Text>
        <Text>Fetching pages and databases from your Notion workspace...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          Error Loading Notion Data
        </Text>
        <Text></Text>
        <Text>{error}</Text>
        <Text></Text>
        <Text dimColor>
          Make sure your NOTION_API_KEY is set correctly and the integration has access to your pages.
        </Text>
      </Box>
    );
  }

  if (allItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          No Notion Content Found
        </Text>
        <Text></Text>
        <Text>
          No pages or databases were found that are accessible to your integration.
        </Text>
        <Text></Text>
        <Text dimColor>
          Make sure to share your Notion pages/databases with the integration.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Notion {showingDatabases ? "Database" : "Page/Database"}
      </Text>
      <Text></Text>
      <Text>
        Found {pages.length} pages and {databases.length} databases accessible to your integration.
      </Text>
      <Text dimColor>
        Use ↑/↓ arrows to navigate, ←/→ to change pages, Enter to select, 'd' to toggle databases only
      </Text>
      <Text></Text>

      {showingDatabases && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>
            Showing databases only (press 'd' to show all)
          </Text>
        </Box>
      )}

      {(() => {
        const totalPages = Math.ceil(allItems.length / itemsPerPage);
        const startIndex = currentPage * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
        const currentPageItems = allItems.slice(startIndex, endIndex);
        
        return (
          <>
            {totalPages > 1 && (
              <Text dimColor>
                Page {currentPage + 1} of {totalPages} | Items {startIndex + 1}-{endIndex} of {allItems.length}
              </Text>
            )}
            <Text></Text>
            
            {currentPageItems.map((item, pageIndex) => {
              const actualIndex = startIndex + pageIndex;
              const isSelected = actualIndex === selectedIndex;
              const isDatabase = "properties" in item;
              const itemType = isDatabase ? "Database" : "Page";
              
              return (
                <Box key={item.id} flexDirection="column" marginBottom={1}>
                  <Box>
                    <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                      {isSelected ? "→ " : "  "}
                      {item.title}
                    </Text>
                    <Text dimColor> ({itemType})</Text>
                  </Box>
                  <Box marginLeft={4}>
                    <Text dimColor>
                      Last edited: {new Date(item.lastEditedTime).toLocaleDateString()}
                    </Text>
                  </Box>
                </Box>
              );
            })}
          </>
        );
      })()}

      <Text></Text>
      <Text dimColor>
        Press Enter to select, ←/→ for pages, 'd' to toggle databases only, Ctrl+C to exit
      </Text>
    </Box>
  );
};