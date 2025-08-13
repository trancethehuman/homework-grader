import React, { useState, useEffect, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import {
  NotionService,
  NotionPage,
  NotionDatabase,
} from "../../lib/notion/notion-service.js";
import { SearchInput } from "../ui/search-input.js";
import { NotionOAuthClient } from "../../lib/notion/oauth-client.js";
import { BackButton, useBackNavigation } from "../ui/back-button.js";

interface NotionPageSelectorProps {
  onSelect: (pageId: string, pageTitle: string) => void;
  onStartGrading?: (pageId: string, pageTitle: string) => void;
  onError: (error: string) => void;
  onBack?: () => void;
  // Optional pre-loaded data to avoid refetching
  cachedPages?: NotionPage[];
  cachedDatabases?: NotionDatabase[];
  // Callback to cache data when first loaded
  onDataLoaded?: (pages: NotionPage[], databases: NotionDatabase[]) => void;
}

export const NotionPageSelector: React.FC<NotionPageSelectorProps> = ({
  onSelect,
  onStartGrading,
  onError,
  onBack,
  cachedPages,
  cachedDatabases,
  onDataLoaded,
}) => {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingDatabases, setShowingDatabases] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(true);
  const [isViewAllMode, setIsViewAllMode] = useState(false);
  const itemsPerPage = 10;
  const maxSearchResults = 3;

  const baseItems = showingDatabases ? databases : [...pages, ...databases];

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return baseItems;
    }
    return baseItems.filter((item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [baseItems, searchTerm]);

  const displayItems = isViewAllMode ? baseItems : filteredItems;
  const searchResultsItems = filteredItems.slice(0, maxSearchResults);

  const { handleBackInput } = useBackNavigation(
    () => onBack?.(),
    !!onBack,
    () => isSearchFocused && !isViewAllMode // Disable back navigation when search input is focused
  );

  useEffect(() => {
    const loadNotionData = async () => {
      try {
        setIsLoading(true);

        // Use cached data if available (and not empty)
        if (
          (cachedPages && cachedPages.length > 0) ||
          (cachedDatabases && cachedDatabases.length > 0)
        ) {
          setPages(cachedPages || []);
          setDatabases(cachedDatabases || []);
          setError(null);
          setIsLoading(false);
          return;
        }

        // Otherwise fetch fresh data
        const oauth = new NotionOAuthClient();
        await oauth.refreshIfPossible();
        await oauth.ensureAuthenticated();
        const notionService = new NotionService();

        const [pagesData, databasesData] = await Promise.all([
          notionService.getAllPages(),
          notionService.getAllDatabases(),
        ]);

        setPages(pagesData);
        setDatabases(databasesData);
        setError(null);

        // Cache the data for future use
        onDataLoaded?.(pagesData, databasesData);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load Notion data";
        setError(errorMessage);
        onError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotionData();
  }, [onError, cachedPages, cachedDatabases, onDataLoaded]);

  // Reset selection when search term changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  useInput((input, key) => {
    if (isLoading || error) return;

    // Handle back navigation first
    if (handleBackInput(input, key)) {
      return;
    }

    // Handle 's' key to switch to search mode from anywhere
    if (input === "s" && !isSearchFocused) {
      setIsViewAllMode(false);
      setIsSearchFocused(true);
      setSelectedIndex(0);
      return;
    }

    // Handle 'g' key to start grading directly (only for databases and only if onStartGrading is provided)
    if (input === "g" && onStartGrading && !isSearchFocused) {
      const items = isViewAllMode ? displayItems : searchResultsItems;
      const currentItem = items[selectedIndex];
      if (currentItem && "properties" in currentItem) {
        // It's a database
        onStartGrading(currentItem.id, currentItem.title);
        return;
      }
    }

    // Handle search input when search is focused
    if (isSearchFocused && !isViewAllMode) {
      if (key.return) {
        // If there are search results, select the first one
        if (searchResultsItems.length > 0) {
          const item = searchResultsItems[0];
          onSelect(item.id, item.title);
        }
        return;
      }

      if (key.downArrow) {
        // Move to search results list if there are results
        if (searchResultsItems.length > 0) {
          setIsSearchFocused(false);
          setSelectedIndex(0);
        }
        return;
      }

      if (key.backspace || key.delete) {
        setSearchTerm(searchTerm.slice(0, -1));
        return;
      }

      // Handle regular character input
      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchTerm(searchTerm + input);
        return;
      }

      return;
    }

    // Handle view all mode (existing functionality)
    if (isViewAllMode) {
      const totalPages = Math.ceil(displayItems.length / itemsPerPage);
      const startIndex = currentPage * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, displayItems.length);

      if (key.upArrow) {
        setSelectedIndex((prev) => {
          const newIndex = Math.max(0, prev - 1);
          if (newIndex < startIndex && currentPage > 0) {
            setCurrentPage(currentPage - 1);
            return newIndex;
          }
          return newIndex;
        });
      } else if (key.downArrow) {
        setSelectedIndex((prev) => {
          const newIndex = Math.min(displayItems.length - 1, prev + 1);
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
        setSelectedIndex(
          Math.min(displayItems.length - 1, (currentPage + 1) * itemsPerPage)
        );
      } else if (key.return) {
        if (displayItems[selectedIndex]) {
          const item = displayItems[selectedIndex];
          onSelect(item.id, item.title);
        }
      } else if (input === "d") {
        setShowingDatabases(!showingDatabases);
        setSelectedIndex(0);
        setCurrentPage(0);
      }
      return;
    }

    // Handle navigation in search results (not view all mode, not search focused)
    if (!isViewAllMode && !isSearchFocused) {
      const maxIndex = searchResultsItems.length; // +1 for "View All" button

      if (key.upArrow) {
        if (selectedIndex === 0) {
          setIsSearchFocused(true);
        } else {
          setSelectedIndex(selectedIndex - 1);
        }
      } else if (key.downArrow) {
        setSelectedIndex(Math.min(maxIndex, selectedIndex + 1));
      } else if (key.return) {
        if (selectedIndex < searchResultsItems.length) {
          // Select a search result
          const item = searchResultsItems[selectedIndex];
          onSelect(item.id, item.title);
        } else if (selectedIndex === searchResultsItems.length) {
          // "View All" button selected
          setIsViewAllMode(true);
          setSelectedIndex(0);
          setCurrentPage(0);
        }
      }
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
          Authenticate with Notion first from the CLI prompt, then try again.
        </Text>
      </Box>
    );
  }

  if (baseItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          No Notion Content Found
        </Text>
        <Text></Text>
        <Text>
          No pages or databases were found that are accessible to your
          integration.
        </Text>
        <Text></Text>
        <Text dimColor>
          Make sure to share your Notion pages/databases with the integration.
        </Text>
      </Box>
    );
  }

  // Render View All Mode
  if (isViewAllMode) {
    const totalPages = Math.ceil(displayItems.length / itemsPerPage);
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, displayItems.length);
    const currentPageItems = displayItems.slice(startIndex, endIndex);

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Select Notion {showingDatabases ? "Database" : "Page/Database"} - View
          All Mode
        </Text>
        <Text></Text>
        <Text>
          Found {pages.length} pages and {databases.length} databases accessible
          to your integration.
        </Text>
        <Text dimColor>
          Use ↑/↓ arrows to navigate, ←/→ to change pages, Enter to select, 'd'
          to toggle databases only, 's' to search
          {onStartGrading && ", 'g' to start grading database"}
        </Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        {showingDatabases && (
          <Box marginBottom={1}>
            <Text color="yellow" bold>
              Showing databases only (press 'd' to show all)
            </Text>
          </Box>
        )}

        {totalPages > 1 && (
          <Text dimColor>
            Page {currentPage + 1} of {totalPages} | Items {startIndex + 1}-
            {endIndex} of {displayItems.length}
          </Text>
        )}
        <Text></Text>

        {currentPageItems.map((item, pageIndex) => {
          const actualIndex = startIndex + pageIndex;
          const isSelected = actualIndex === selectedIndex;
          const isDatabase = "properties" in item;
          const itemType = isDatabase ? "Database" : "Page";
          const canGrade = isDatabase && onStartGrading;

          return (
            <Box key={item.id} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}
                  {item.title}
                </Text>
                <Text dimColor> ({itemType})</Text>
                {isSelected && canGrade && (
                  <Text color="green"> [Press 'g' to grade]</Text>
                )}
              </Box>
              <Box marginLeft={4}>
                <Text dimColor>
                  Last edited:{" "}
                  {new Date(item.lastEditedTime).toLocaleDateString()}
                </Text>
              </Box>
            </Box>
          );
        })}

        <Text></Text>
        <Text dimColor>
          Press Enter to select, ←/→ for pages, 'd' to toggle databases only,
          's' to search{onStartGrading && ", 'g' to grade database"}, Ctrl+C to
          exit
        </Text>
      </Box>
    );
  }

  // Render Search Mode (default)
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Notion {showingDatabases ? "Database" : "Page/Database"}
      </Text>
      <Text></Text>
      <Text>
        Found {pages.length} pages and {databases.length} databases accessible
        to your integration.
      </Text>
      <Text dimColor>
        Type to search, ↑/↓ arrows to navigate, Enter to select
        {onStartGrading && ", 'g' to grade database"}
      </Text>
      <Text></Text>

      <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

      <SearchInput
        value={searchTerm}
        placeholder="Search pages and databases..."
        isFocused={isSearchFocused}
        onChange={setSearchTerm}
      />

      {showingDatabases && (
        <Box marginBottom={1}>
          <Text color="yellow" bold>
            Showing databases only (press 'd' to show all in View All mode)
          </Text>
        </Box>
      )}

      {searchTerm && filteredItems.length === 0 ? (
        <Box marginBottom={1}>
          <Text color="yellow">No results found for "{searchTerm}"</Text>
        </Box>
      ) : (
        <>
          {searchResultsItems.map((item, index) => {
            const isSelected = !isSearchFocused && selectedIndex === index;
            const isDatabase = "properties" in item;
            const itemType = isDatabase ? "Database" : "Page";
            const canGrade = isDatabase && onStartGrading;

            return (
              <Box key={item.id} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                    {isSelected ? "→ " : "  "}
                    {item.title}
                  </Text>
                  <Text dimColor> ({itemType})</Text>
                  {isSelected && canGrade && (
                    <Text color="green"> [Press 'g' to grade]</Text>
                  )}
                </Box>
                <Box marginLeft={4}>
                  <Text dimColor>
                    Last edited:{" "}
                    {new Date(item.lastEditedTime).toLocaleDateString()}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {filteredItems.length > maxSearchResults && (
            <Box marginBottom={1}>
              <Text
                color={
                  !isSearchFocused &&
                  selectedIndex === searchResultsItems.length
                    ? "blue"
                    : "gray"
                }
                bold={
                  !isSearchFocused &&
                  selectedIndex === searchResultsItems.length
                }
              >
                {!isSearchFocused && selectedIndex === searchResultsItems.length
                  ? "→ "
                  : "  "}
                View All ({filteredItems.length} total results)
              </Text>
            </Box>
          )}
        </>
      )}

      <Text></Text>
      <Text dimColor>
        Press Enter to select, 's' to focus search
        {onStartGrading && ", 'g' to grade database"}, Ctrl+C to exit
      </Text>
    </Box>
  );
};
