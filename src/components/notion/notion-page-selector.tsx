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
  const [searchTerm, setSearchTerm] = useState("");
  const [focusArea, setFocusArea] = useState<FocusArea>('search');
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("warming-up");
  const [loadingStartTime] = useState(Date.now());
  const [scrollOffset, setScrollOffset] = useState(0);
  const viewportSize = 8;

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

  const allItems = filteredItems;
  const hasLoadMoreOption = hasMoreItems && !searchTerm;
  const totalItemsWithLoadMore = allItems.length + (hasLoadMoreOption ? 1 : 0);

  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(scrollOffset + viewportSize, totalItemsWithLoadMore);
  const displayItems = allItems.slice(visibleStartIndex, Math.min(visibleEndIndex, allItems.length));

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
      setFocusArea('search');
      setSelectedIndex(0);
      return;
    }

    // Handle 'g' key to start grading (only for databases)
    if (input === "g" && onStartGrading && focusArea === 'list') {
      const currentItem = displayItems[selectedIndex];
      if (currentItem && "properties" in currentItem) {
        setIsStartingGrading(true);
        setSelectedDatabaseName(currentItem.title);
        onStartGrading(currentItem.id, currentItem.title);
        return;
      }
    }

    // Handle 'd' key to toggle databases only
    if (input === "d") {
      setShowingDatabases(!showingDatabases);
      setSelectedIndex(0);
      setScrollOffset(0);
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
    if (focusArea === 'search') {
      if (key.return) {
        if (displayItems.length > 0) {
          const item = displayItems[0];
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
        }
        return;
      }

      // Up arrow from search bar goes to the list above (only if there are items)
      if (key.upArrow) {
        if (totalItemsWithLoadMore > 0) {
          setFocusArea('list');
          const lastIndex = totalItemsWithLoadMore - 1;
          setSelectedIndex(lastIndex);
          // Scroll to show the last item
          const newScrollOffset = Math.max(0, lastIndex - viewportSize + 1);
          setScrollOffset(newScrollOffset);
        }
        return;
      }

      // Down arrow from search bar goes to first list item (circular navigation)
      if (key.downArrow) {
        if (totalItemsWithLoadMore > 0) {
          setFocusArea('list');
          setSelectedIndex(0);
          setScrollOffset(0);
        } else if (onBack) {
          setFocusArea('back');
        }
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

    // Handle navigation in list (search bar is at the bottom)
    if (focusArea === 'list') {
      const loadMoreIndex = allItems.length;

      if (key.upArrow) {
        if (selectedIndex > 0) {
          const newIndex = selectedIndex - 1;
          setSelectedIndex(newIndex);
          // Scroll up if needed
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else {
          // At first item, wrap to search bar at bottom
          setFocusArea('search');
        }
      } else if (key.downArrow) {
        // Down arrow at the last item goes to search bar
        if (selectedIndex >= totalItemsWithLoadMore - 1) {
          setFocusArea('search');
        } else {
          const newIndex = selectedIndex + 1;
          setSelectedIndex(newIndex);
          // Scroll down if needed
          if (newIndex >= scrollOffset + viewportSize) {
            setScrollOffset(newIndex - viewportSize + 1);
          }
        }
      } else if (key.return) {
        if (selectedIndex < allItems.length) {
          const item = allItems[selectedIndex];
          const type = "properties" in item ? "database" : "page";
          onSelect(item.id, item.title, type);
        } else if (hasLoadMoreOption && selectedIndex === loadMoreIndex) {
          loadMore();
        }
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        // Auto-focus search and type when pressing letters (not shortcuts)
        // Reserved shortcuts: b (back), s (search), g (grade), d (toggle databases)
        if (!['b', 's', 'g', 'd'].includes(input.toLowerCase())) {
          setFocusArea('search');
          setSearchTerm(searchTerm + input);
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

  const loadMoreIndex = allItems.length;
  const showScrollIndicatorTop = scrollOffset > 0;
  const showScrollIndicatorBottom = visibleEndIndex < totalItemsWithLoadMore;
  const showLoadMoreInViewport = hasLoadMoreOption && visibleEndIndex > allItems.length;

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Notion Workspace
      </Text>
      <Text></Text>

      {showingDatabases && (
        <Box marginBottom={1}>
          <Text color="yellow">Showing databases only</Text>
        </Box>
      )}

      {searchTerm && filteredItems.length === 0 && (
        <Box marginBottom={1}>
          <Text color="yellow">No results found for "{searchTerm}"</Text>
        </Box>
      )}

      {isSearching && (
        <Box marginBottom={1}>
          <Text color="cyan">Searching...</Text>
        </Box>
      )}

      {allItems.length > 0 && (
        <>
          {showScrollIndicatorTop && (
            <Text dimColor>  ↑ more above</Text>
          )}

          {displayItems.map((item, displayIndex) => {
            const actualIndex = visibleStartIndex + displayIndex;
            const isSelected = focusArea === 'list' && selectedIndex === actualIndex;
            const isDatabase = "properties" in item;
            const itemType = isDatabase ? "Database" : "Page";
            const canGrade = isDatabase && onStartGrading;

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}{item.title}
                </Text>
                <Text dimColor> ({itemType})</Text>
                {isSelected && canGrade && (
                  <Text color="green"> [g to grade]</Text>
                )}
              </Box>
            );
          })}

          {showLoadMoreInViewport && (() => {
            const isLoadMoreSelected = focusArea === 'list' && selectedIndex === loadMoreIndex;
            return (
              <Box>
                <Text
                  color={isLoadMoreSelected ? "blue" : "gray"}
                  bold={isLoadMoreSelected}
                >
                  {isLoadMoreSelected ? "→ " : "  "}{isLoadingMore ? "Loading..." : "Load more..."}
                </Text>
              </Box>
            );
          })()}

          {showScrollIndicatorBottom && !showLoadMoreInViewport && (
            <Text dimColor>  ↓ more below</Text>
          )}
        </>
      )}

      <Text></Text>
      <SearchInput
        value={searchTerm}
        placeholder="Search..."
        isFocused={isSearchFocused}
        onChange={setSearchTerm}
      />
      {onBack && (
        <Box>
          <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
            ← back
          </Text>
        </Box>
      )}
    </Box>
  );
};
