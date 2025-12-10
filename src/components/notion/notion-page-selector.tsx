import React, { useState, useEffect, useMemo, useRef } from "react";
import { Text, Box, useInput } from "ink";
import {
  NotionService,
  NotionPage,
  NotionDatabase,
} from "../../lib/notion/notion-service.js";
import { SearchInput } from "../ui/search-input.js";
import { NotionOAuthClient } from "../../lib/notion/oauth-client.js";
import { NotionTokenStorage } from "../../lib/notion/notion-token-storage.js";
import { ApiTimeoutHandler, TimeoutError, CircuitBreakerError } from "../../lib/notion/api-timeout-handler.js";
import { NotionDataLoading, LoadingPhase } from "./notion-data-loading.js";
import { useDebounce } from "../../hooks/index.js";

type FocusArea = 'list' | 'search' | 'back';

const DEFAULT_PROXY_URL =
  process.env.NOTION_PROXY_URL || "https://notion-proxy-8xr3.onrender.com";

interface NotionPageSelectorProps {
  onSelect: (pageId: string, pageTitle: string, type: "page" | "database") => void;
  onStartGrading?: (pageId: string, pageTitle: string) => void;
  onError: (error: string) => void;
  onAuthenticationRequired?: () => void;
  onBack?: () => void;
  cachedPages?: NotionPage[];
  cachedDatabases?: NotionDatabase[];
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
  const [focusArea, setFocusArea] = useState<FocusArea>('search');
  const [isViewAllMode, setIsViewAllMode] = useState(false);
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("warming-up");
  const [loadingStartTime] = useState(Date.now());
  const itemsPerPage = 10;
  const maxSearchResults = 3;

  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMoreItems, setHasMoreItems] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const notionServiceRef = useRef<NotionService | null>(null);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const isSearchFocused = focusArea === 'search';
  const isBackFocused = focusArea === 'back';

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

  useEffect(() => {
    const loadNotionData = async () => {
      try {
        setIsLoading(true);
        setLoadingPhase("warming-up");

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

        try {
          await fetch(`${DEFAULT_PROXY_URL}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          // Ignore warmup errors
        }

        setLoadingPhase("authenticating");

        const oauth = new NotionOAuthClient();

        await ApiTimeoutHandler.withTimeout(async () => {
          await oauth.refreshIfPossible();
          return Promise.resolve();
        }, {
          timeoutMs: 30000,
          retries: 1,
          operation: 'Token Refresh'
        });

        const token = await ApiTimeoutHandler.withTimeout(async () => {
          return await oauth.ensureAuthenticated();
        }, {
          timeoutMs: 120000,
          retries: 1,
          operation: 'OAuth Authentication'
        });

        setLoadingPhase("fetching");

        const notionService = new NotionService(token.access_token);
        notionServiceRef.current = notionService;

        const initialResult = await ApiTimeoutHandler.withTimeout(
          () => notionService.getInitialItems(10),
          { timeoutMs: 15000, retries: 1, operation: 'Initial Notion Data' }
        );

        setPages(initialResult.pages);
        setDatabases(initialResult.databases);
        setNextCursor(initialResult.nextCursor);
        setHasMoreItems(initialResult.hasMore);
        setError(null);

        onDataLoaded?.(initialResult.pages, initialResult.databases);
      } catch (err) {
        let errorMessage = "Failed to load Notion data";
        let shouldRetriggerAuth = false;

        if (err instanceof TimeoutError) {
          errorMessage = `Connection timed out. This often happens when the server is starting up after being idle.\n\nPlease try again - the second attempt usually works much faster!`;
          shouldRetriggerAuth = false;
        } else if (err instanceof CircuitBreakerError) {
          errorMessage = `Service temporarily unavailable: ${err.message}\n\nThe Notion API is experiencing issues. Please try again in a few minutes.`;
        } else if (err instanceof Error) {
          errorMessage = err.message;

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
          const tokenStorage = new NotionTokenStorage();
          tokenStorage.clearToken();
          setTimeout(() => {
            onAuthenticationRequired();
          }, 1500);
          return;
        }

        onError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    loadNotionData();
  }, [onError, cachedPages, cachedDatabases, onDataLoaded]);

  useEffect(() => {
    setSelectedIndex(0);
    // When search term changes, keep focus on search bar
    if (searchTerm) {
      setFocusArea('search');
    }
  }, [searchTerm]);

  // When filtered items become empty, ensure focus stays on search/back
  useEffect(() => {
    if (filteredItems.length === 0 && focusArea === 'list') {
      setFocusArea('search');
    }
  }, [filteredItems.length, focusArea]);

  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchTerm.trim() || !notionServiceRef.current) {
        return;
      }

      setIsSearching(true);
      setLoadingPhase("searching");

      try {
        const results = await notionServiceRef.current.searchWithQuery(debouncedSearchTerm, {
          pageSize: 20,
          filter: 'both'
        });

        setPages(results.pages);
        setDatabases(results.databases);
        setNextCursor(results.nextCursor);
        setHasMoreItems(results.hasMore);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm]);

  const loadMore = async () => {
    if (!hasMoreItems || isLoadingMore || !nextCursor || !notionServiceRef.current) return;

    setIsLoadingMore(true);
    setLoadingPhase("loading-more");

    try {
      const moreResults = await notionServiceRef.current.loadMoreItems(nextCursor, 10);

      setPages(prev => [...prev, ...moreResults.pages]);
      setDatabases(prev => [...prev, ...moreResults.databases]);
      setNextCursor(moreResults.nextCursor);
      setHasMoreItems(moreResults.hasMore);
    } catch (err) {
      console.error('Load more failed:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useInput((input, key) => {
    if (isLoading || error || isStartingGrading) return;

    // Handle 'b' key to go back from anywhere
    if (input === "b" && onBack && focusArea !== 'search') {
      onBack();
      return;
    }

    // Handle 's' key to focus search
    if (input === "s" && focusArea !== 'search') {
      setIsViewAllMode(false);
      setFocusArea('search');
      setSelectedIndex(0);
      return;
    }

    // Handle 'g' key to start grading (only for databases)
    if (input === "g" && onStartGrading && focusArea === 'list') {
      const items = isViewAllMode ? displayItems : searchResultsItems;
      const currentItem = items[selectedIndex];
      if (currentItem && "properties" in currentItem) {
        setIsStartingGrading(true);
        setSelectedDatabaseName(currentItem.title);
        onStartGrading(currentItem.id, currentItem.title);
        return;
      }
    }

    // Handle 'd' key to toggle databases only (in view all mode)
    if (input === "d" && isViewAllMode) {
      setShowingDatabases(!showingDatabases);
      setSelectedIndex(0);
      setCurrentPage(0);
      return;
    }

    // Handle back button focus
    if (focusArea === 'back') {
      if (key.upArrow) {
        setFocusArea('search');
        return;
      }
      if (key.return) {
        onBack?.();
        return;
      }
      return;
    }

    // Handle search input when search is focused
    if (focusArea === 'search' && !isViewAllMode) {
      if (key.return) {
        if (searchResultsItems.length > 0) {
          const item = searchResultsItems[0];
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
        }
        return;
      }

      // Up arrow from search bar goes to the list above (only if there are items)
      if (key.upArrow) {
        if (filteredItems.length > 0) {
          setFocusArea('list');
          const hasViewAll = filteredItems.length > maxSearchResults;
          const hasLoadMore = hasMoreItems && !searchTerm;
          const lastIndex = searchResultsItems.length - 1 + (hasViewAll ? 1 : 0) + (hasLoadMore ? 1 : 0);
          setSelectedIndex(lastIndex);
        }
        return;
      }

      // Down arrow from search bar goes to back button
      if (key.downArrow && onBack) {
        setFocusArea('back');
        return;
      }

      if (key.backspace || key.delete) {
        setSearchTerm(searchTerm.slice(0, -1));
        return;
      }

      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchTerm(searchTerm + input);
        return;
      }

      return;
    }

    // Handle view all mode
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
      }
      return;
    }

    // Handle navigation in list (search bar is at the bottom)
    if (!isViewAllMode && focusArea === 'list') {
      const hasViewAll = filteredItems.length > maxSearchResults;
      const hasLoadMore = hasMoreItems && !searchTerm;
      const viewAllIndex = searchResultsItems.length;
      const loadMoreIndex = hasViewAll ? viewAllIndex + 1 : viewAllIndex;
      const maxIndex = loadMoreIndex + (hasLoadMore ? 1 : 0);

      if (key.upArrow) {
        if (selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
        }
      } else if (key.downArrow) {
        // Down arrow at the last item goes to search bar
        if (selectedIndex >= maxIndex - 1) {
          setFocusArea('search');
        } else {
          setSelectedIndex(selectedIndex + 1);
        }
      } else if (key.return) {
        if (selectedIndex < searchResultsItems.length) {
          const item = searchResultsItems[selectedIndex];
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
        } else if (hasViewAll && selectedIndex === viewAllIndex) {
          setIsViewAllMode(true);
          setSelectedIndex(0);
          setCurrentPage(0);
        } else if (hasLoadMore && selectedIndex === loadMoreIndex) {
          loadMore();
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
    return (
      <NotionDataLoading
        phase={loadingPhase}
        startTime={loadingStartTime}
      />
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

  // View All Mode
  if (isViewAllMode) {
    const totalPages = Math.ceil(displayItems.length / itemsPerPage);
    const startIndex = currentPage * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, displayItems.length);
    const currentPageItems = displayItems.slice(startIndex, endIndex);

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Notion Workspace
        </Text>
        <Text>
          {showingDatabases ? "Databases" : "Pages & Databases"} • {displayItems.length} items
        </Text>
        <Text></Text>

        {showingDatabases && (
          <Box marginBottom={1}>
            <Text color="yellow">Showing databases only (press 'd' to show all)</Text>
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
            <Box key={item.id} marginBottom={1}>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {item.title}
              </Text>
              <Text dimColor> ({itemType})</Text>
              {isSelected && canGrade && (
                <Text color="green"> [Press 'g' to grade]</Text>
              )}
            </Box>
          );
        })}

        <Text></Text>
        <Box>
          <Text color={isSearchFocused ? "blue" : "white"} bold={isSearchFocused}>
            {isSearchFocused ? "→ " : "  "}
          </Text>
          <SearchInput
            value={searchTerm}
            placeholder="Search pages and databases..."
            isFocused={isSearchFocused}
            onChange={setSearchTerm}
          />
        </Box>
        {onBack && (
          <Box>
            <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
              {isBackFocused ? "→ " : "  "}
              ← back
            </Text>
          </Box>
        )}
        <Text></Text>
        <Text dimColor>
          ↑/↓ navigate, ←/→ pages, Enter select, 's' search, 'd' toggle databases
          {onStartGrading && ", 'g' grade"}, 'b' back
        </Text>
      </Box>
    );
  }

  // Default Search Mode
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Notion Workspace
      </Text>
      <Text>
        {pages.length} pages, {databases.length} databases
      </Text>
      <Text></Text>

      {searchTerm && filteredItems.length === 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">No results found for "{searchTerm}"</Text>
        </Box>
      )}
      {filteredItems.length > 0 && (
        <>
          {searchResultsItems.map((item, index) => {
            const isSelected = focusArea === 'list' && selectedIndex === index;
            const isDatabase = "properties" in item;
            const itemType = isDatabase ? "Database" : "Page";
            const canGrade = isDatabase && onStartGrading;

            return (
              <Box key={item.id} marginBottom={1}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}
                  {item.title}
                </Text>
                <Text dimColor> ({itemType})</Text>
                {isSelected && canGrade && (
                  <Text color="green"> [Press 'g' to grade]</Text>
                )}
              </Box>
            );
          })}

          {filteredItems.length > maxSearchResults && (
            <Box marginBottom={1}>
              <Text
                color={
                  focusArea === 'list' && selectedIndex === searchResultsItems.length
                    ? "blue"
                    : "gray"
                }
                bold={
                  focusArea === 'list' && selectedIndex === searchResultsItems.length
                }
              >
                {focusArea === 'list' && selectedIndex === searchResultsItems.length
                  ? "→ "
                  : "  "}
                View All ({filteredItems.length} total results)
              </Text>
            </Box>
          )}

          {hasMoreItems && !searchTerm && (() => {
            const loadMoreIdx = filteredItems.length > maxSearchResults
              ? searchResultsItems.length + 1
              : searchResultsItems.length;
            const isLoadMoreSelected = focusArea === 'list' && selectedIndex === loadMoreIdx;
            return (
              <Box marginBottom={1}>
                <Text
                  color={isLoadMoreSelected ? "blue" : "gray"}
                  bold={isLoadMoreSelected}
                >
                  {isLoadMoreSelected ? "→ " : "  "}
                  {isLoadingMore ? "Loading..." : "Load more items..."}
                </Text>
              </Box>
            );
          })()}
        </>
      )}

      {isSearching && (
        <Box marginBottom={1}>
          <Text color="cyan">Searching...</Text>
        </Box>
      )}

      <Text></Text>
      <Box>
        <Text color={isSearchFocused ? "blue" : "white"} bold={isSearchFocused}>
          {isSearchFocused ? "→ " : "  "}
        </Text>
        <SearchInput
          value={searchTerm}
          placeholder="Search pages and databases..."
          isFocused={isSearchFocused}
          onChange={setSearchTerm}
        />
      </Box>
      {onBack && (
        <Box>
          <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
            {isBackFocused ? "→ " : "  "}
            ← back
          </Text>
        </Box>
      )}
      <Text></Text>
      <Text dimColor>
        ↑/↓ navigate, Enter select
        {onStartGrading && ", 'g' grade"}, 'b' back
      </Text>
    </Box>
  );
};
