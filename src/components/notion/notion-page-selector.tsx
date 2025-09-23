import React, { useState, useEffect, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import {
  NotionService,
  NotionPage,
  NotionDatabase,
} from "../../lib/notion/notion-service.js";
import { SearchInput } from "../ui/search-input.js";
import { NotionOAuthClient } from "../../lib/notion/oauth-client.js";
import { NotionTokenStorage } from "../../lib/notion/notion-token-storage.js";
import { BackButton, useBackNavigation } from "../ui/back-button.js";
import { ApiTimeoutHandler, TimeoutError, CircuitBreakerError } from "../../lib/notion/api-timeout-handler.js";

interface NotionPageSelectorProps {
  onSelect: (pageId: string, pageTitle: string, type: "page" | "database") => void;
  onStartGrading?: (pageId: string, pageTitle: string) => void;
  onError: (error: string) => void;
  onAuthenticationRequired?: () => void;
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
  onAuthenticationRequired,
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
  const [loadingIconIndex, setLoadingIconIndex] = useState(0);
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");
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

        // Otherwise fetch fresh data with enhanced timeout and error handling
        const oauth = new NotionOAuthClient();

        // Refresh token if possible with timeout
        await ApiTimeoutHandler.withTimeout(async () => {
          await oauth.refreshIfPossible();
          return Promise.resolve();
        }, {
          timeoutMs: 30000, // 30 seconds for token refresh
          retries: 1,
          operation: 'Token Refresh'
        });

        // Ensure authentication with extended timeout for cold proxy
        const token = await ApiTimeoutHandler.withTimeout(async () => {
          return await oauth.ensureAuthenticated();
        }, {
          timeoutMs: 120000, // 2 minutes for full OAuth flow (includes cold proxy startup)
          retries: 1,
          operation: 'OAuth Authentication'
        });

        const notionService = new NotionService(token.access_token);

        // Fetch data with concurrent timeout handling
        const [pagesData, databasesData] = await ApiTimeoutHandler.withConcurrentTimeout([
          () => notionService.getAllPages(),
          () => notionService.getAllDatabases()
        ], {
          timeoutMs: 45000, // 45 seconds total for data fetching
          retries: 1,
          operation: 'Notion Data Loading'
        });

        setPages(pagesData as NotionPage[]);
        setDatabases(databasesData as NotionDatabase[]);
        setError(null);

        // Cache the data for future use
        onDataLoaded?.(pagesData as NotionPage[], databasesData as NotionDatabase[]);
      } catch (err) {
        let errorMessage = "Failed to load Notion data";
        let shouldRetriggerAuth = false;

        if (err instanceof TimeoutError) {
          errorMessage = `Operation timed out: ${err.message}\n\nThis may be due to:\n• Slow network connection\n• Notion proxy server starting up (takes ~60s when idle)\n• Heavy load on Notion's API\n\nPlease try again in a moment.`;
        } else if (err instanceof CircuitBreakerError) {
          errorMessage = `Service temporarily unavailable: ${err.message}\n\nThe Notion API is experiencing issues. Please try again in a few minutes.`;
        } else if (err instanceof Error) {
          errorMessage = err.message;

          // Check if this is an authentication error
          if (err.message.includes("Token validation failed") ||
              err.message.includes("API token is invalid") ||
              err.message.includes("Unauthorized") ||
              err.message.includes("401") ||
              err.message.includes("403") ||
              err.message.includes("expired") ||
              err.message.includes("Invalid refresh token") ||
              err.message.includes("OAuth")) {
            shouldRetriggerAuth = true;
            errorMessage = `Authentication failed: ${err.message}\n\nYour Notion token has expired or is invalid. Please re-authenticate.`;
          } else if (err.message.includes("Failed to start OAuth") ||
                     err.message.includes("OAuth polling failed") ||
                     err.message.includes("OAuth timeout")) {
            errorMessage = `Authentication service error: ${err.message}\n\nPossible causes:\n• Notion proxy server is starting up (~60s delay)\n• Network connectivity issues\n• Browser blocked the authentication popup\n\nTry again or check your network connection.`;
          } else if (err.message.includes("fetch")) {
            errorMessage = `Network error: ${err.message}\n\nPlease check your internet connection and try again.`;
          }
        }

        setError(errorMessage);

        if (shouldRetriggerAuth && onAuthenticationRequired) {
          // Clear the invalid token and trigger re-authentication
          const tokenStorage = new NotionTokenStorage();
          tokenStorage.clearToken();
          setTimeout(() => {
            onAuthenticationRequired();
          }, 1500); // Small delay to let user read the error message
          return;
        }

        onError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotionData();
  }, [onError, cachedPages, cachedDatabases, onDataLoaded]);

  // Loading animation effect
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isLoading) {
      interval = setInterval(() => {
        setLoadingIconIndex((prev) => (prev + 1) % 6);
      }, 2000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading]);

  // Reset selection when search term changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  useInput((input, key) => {
    if (isLoading || error || isStartingGrading) return;

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
        // It's a database - immediately set loading state before async operations
        setIsStartingGrading(true);
        setSelectedDatabaseName(currentItem.title);
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
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
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
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
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
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
        } else if (selectedIndex === searchResultsItems.length) {
          // "View All" button selected
          setIsViewAllMode(true);
          setSelectedIndex(0);
          setCurrentPage(0);
        }
      }
    }
  });

  if (isStartingGrading) {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold color="blue">
          Preparing to Grade Database
        </Text>
        <Box marginTop={1} alignItems="center">
          <Text>🎯</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">Setting up grading for "{selectedDatabaseName}"...</Text>
        </Box>
        <Box marginTop={2}>
          <Text color="gray">
            Analyzing database structure and detecting GitHub URLs...
          </Text>
        </Box>
      </Box>
    );
  }

  if (isLoading) {
    const loadingIcons = ["🔄", "⚡", "🚀", "✨", "🔮", "💫"];
    const loadingMessages = [
      "Connecting to your Notion workspace...",
      "Fetching pages and databases...",
      "Loading your content...",
      "Organizing workspace data...",
      "Preparing your workspace...",
      "Almost ready...",
    ];

    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold color="blue">
          Loading Notion Data...
        </Text>
        <Box marginTop={1} alignItems="center">
          <Text>{loadingIcons[loadingIconIndex]}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">{loadingMessages[loadingIconIndex]}</Text>
        </Box>
        <Box marginTop={2}>
          <Text color="gray">
            This may take a moment while we fetch your workspace data...
          </Text>
        </Box>
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
