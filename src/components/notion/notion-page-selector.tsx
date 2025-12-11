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
import {
  ApiTimeoutHandler,
  TimeoutError,
  CircuitBreakerError,
} from "../../lib/notion/api-timeout-handler.js";
import { NotionDataLoading, LoadingPhase } from "./notion-data-loading.js";
import {
  useDebounce,
  useFocusNavigation,
  ListRegionState,
  InputRegionState,
} from "../../hooks/index.js";
import { NotionUrlParser } from "../../lib/notion/notion-url-parser.js";

const DEFAULT_PROXY_URL =
  process.env.NOTION_PROXY_URL || "https://notion-proxy-8xr3.onrender.com";

interface NotionPageSelectorProps {
  onSelect: (
    pageId: string,
    pageTitle: string,
    type: "page" | "database"
  ) => void;
  onStartGrading?: (pageId: string, pageTitle: string) => void;
  onSelectForCollaborator?: (pageId: string, pageTitle: string) => void;
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
  onSelectForCollaborator,
  onError,
  onAuthenticationRequired,
  onBack,
  cachedPages,
  cachedDatabases,
  onDataLoaded,
}) => {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showingDatabases, setShowingDatabases] = useState(false);
  const [isStartingGrading, setIsStartingGrading] = useState(false);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState("");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("warming-up");
  const [loadingStartTime] = useState(Date.now());

  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMoreItems, setHasMoreItems] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUrlFetching, setIsUrlFetching] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState<string | null>(null);
  const [urlFetchedItem, setUrlFetchedItem] = useState<
    NotionPage | NotionDatabase | null
  >(null);
  const notionServiceRef = useRef<NotionService | null>(null);

  const viewportSize = 8;

  const baseItems = showingDatabases ? databases : [...pages, ...databases];

  // Use a ref to store the current loadMore function for the callback
  const loadMoreRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const {
    focusedRegion,
    regionStates,
    focusRegion,
    inputSetValue,
    listSelectIndex,
  } = useFocusNavigation({
    regions: [
      {
        id: "list",
        type: "list",
        itemCount: baseItems.length + (hasMoreItems ? 1 : 0),
        viewportSize,
        enabled: baseItems.length > 0 || hasMoreItems,
        onSelect: (index: number) => {
          // Use baseItems directly since filteredItems depends on searchTerm from regionStates
          const items = baseItems;
          if (index < items.length) {
            const item = items[index];
            const type = "properties" in item ? "database" : "page";
            onSelect(item.id, item.title, type);
          } else if (hasMoreItems && index === items.length) {
            loadMoreRef.current?.();
          }
        },
      },
      {
        id: "search",
        type: "input",
        reservedKeys: ["s", "g", "c", "d"],
      },
      {
        id: "back",
        type: "button",
        enabled: !!onBack,
        onActivate: onBack,
      },
      {
        id: "reauth",
        type: "button",
        enabled: !!onAuthenticationRequired,
        onActivate: () => {
          if (onAuthenticationRequired) {
            const tokenStorage = new NotionTokenStorage();
            tokenStorage.clearToken();
            onAuthenticationRequired();
          }
        },
      },
    ],
    initialFocus: "search",
    disabled: isLoading || !!error || isStartingGrading,
  });

  const listState = regionStates.list as ListRegionState | undefined;
  const searchState = regionStates.search as InputRegionState;

  const searchTerm = searchState?.value ?? "";
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const filteredItems = useMemo(() => {
    if (urlFetchedItem) {
      return [urlFetchedItem];
    }
    if (!searchTerm.trim()) {
      return baseItems;
    }
    return baseItems.filter((item) =>
      item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [baseItems, searchTerm, urlFetchedItem]);

  const allItems = filteredItems;
  const hasLoadMoreOption = hasMoreItems && !searchTerm;
  const totalItemsWithLoadMore = allItems.length + (hasLoadMoreOption ? 1 : 0);

  const selectedIndex = listState?.selectedIndex ?? 0;
  const scrollOffset = listState?.scrollOffset ?? 0;
  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(
    scrollOffset + viewportSize,
    totalItemsWithLoadMore
  );
  const displayItems = allItems.slice(
    visibleStartIndex,
    Math.min(visibleEndIndex, allItems.length)
  );

  const isSearchFocused = focusedRegion === "search";
  const isBackFocused = focusedRegion === "back";
  const isReauthFocused = focusedRegion === "reauth";

  useEffect(() => {
    const loadNotionData = async () => {
      const usingCache =
        (cachedPages && cachedPages.length > 0) ||
        (cachedDatabases && cachedDatabases.length > 0);

      try {
        if (usingCache) {
          setPages(cachedPages || []);
          setDatabases(cachedDatabases || []);
          setError(null);
          setIsLoading(false);
        } else {
          setIsLoading(true);
          setLoadingPhase("warming-up");

          try {
            await fetch(`${DEFAULT_PROXY_URL}/health`, {
              method: "GET",
              signal: AbortSignal.timeout(5000),
            });
          } catch {
            // Ignore warmup errors
          }

          setLoadingPhase("authenticating");
        }

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
        notionServiceRef.current = notionService;

        if (!usingCache) {
          setLoadingPhase("fetching");

          const initialResult = await ApiTimeoutHandler.withTimeout(
            () => notionService.getInitialItems(10),
            { timeoutMs: 15000, retries: 1, operation: "Initial Notion Data" }
          );

          setPages(initialResult.pages);
          setDatabases(initialResult.databases);
          setNextCursor(initialResult.nextCursor);
          setHasMoreItems(initialResult.hasMore);
          setError(null);

          onDataLoaded?.(initialResult.pages, initialResult.databases);
        }
      } catch (err) {
        if (usingCache) {
          return;
        }

        let errorMessage = "Failed to load Notion data";
        let shouldRetriggerAuth = false;

        if (err instanceof TimeoutError) {
          errorMessage = `Connection timed out. This often happens when the server is starting up after being idle.\n\nPlease try again - the second attempt usually works much faster!`;
          shouldRetriggerAuth = false;
        } else if (err instanceof CircuitBreakerError) {
          errorMessage = `Service temporarily unavailable: ${err.message}\n\nThe Notion API is experiencing issues. Please try again in a few minutes.`;
        } else if (err instanceof Error) {
          errorMessage = err.message;

          if (
            err.message.includes("Token validation failed") ||
            err.message.includes("API token is invalid") ||
            err.message.includes("Unauthorized") ||
            err.message.includes("401") ||
            err.message.includes("403") ||
            err.message.includes("expired") ||
            err.message.includes("Invalid refresh token") ||
            err.message.includes("OAuth")
          ) {
            shouldRetriggerAuth = true;
            errorMessage = `Authentication failed: ${err.message}\n\nYour Notion token has expired or is invalid. Please re-authenticate.`;
          } else if (
            err.message.includes("Failed to start OAuth") ||
            err.message.includes("OAuth polling failed") ||
            err.message.includes("OAuth timeout")
          ) {
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
        if (!usingCache) {
          setIsLoading(false);
        }
      }
    };

    loadNotionData();
  }, [onError, cachedPages, cachedDatabases, onDataLoaded, onAuthenticationRequired]);

  // Reset list selection when search changes or databases toggle
  useEffect(() => {
    listSelectIndex("list", 0);
  }, [searchTerm, showingDatabases, listSelectIndex]);

  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchTerm.trim() || !notionServiceRef.current) {
        return;
      }

      if (NotionUrlParser.isNotionUrl(debouncedSearchTerm.trim())) {
        return;
      }

      setIsSearching(true);
      setLoadingPhase("searching");

      try {
        const results = await notionServiceRef.current.searchWithQuery(
          debouncedSearchTerm,
          {
            pageSize: 20,
            filter: "both",
          }
        );

        setPages(results.pages);
        setDatabases(results.databases);
        setNextCursor(results.nextCursor);
        setHasMoreItems(results.hasMore);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm]);

  useEffect(() => {
    const fetchFromUrl = async () => {
      setUrlFetchError(null);
      setUrlFetchedItem(null);

      const trimmed = searchTerm.trim();
      if (!trimmed || !NotionUrlParser.isNotionUrl(trimmed)) {
        return;
      }

      const parseResult = NotionUrlParser.parseUrl(trimmed);
      if (!parseResult.isValid || !parseResult.id) {
        setUrlFetchError(parseResult.error || "Invalid Notion URL");
        return;
      }

      if (!notionServiceRef.current) {
        return;
      }

      setIsUrlFetching(true);

      try {
        const item = await notionServiceRef.current.getItemById(parseResult.id);

        if (item.type === "database") {
          const dbItem: NotionDatabase = {
            id: item.id,
            title: item.title,
            url: item.url,
            lastEditedTime: new Date().toISOString(),
            properties: item.properties || {},
          };
          setUrlFetchedItem(dbItem);
        } else {
          const pageItem: NotionPage = {
            id: item.id,
            title: item.title,
            url: item.url,
            lastEditedTime: new Date().toISOString(),
          };
          setUrlFetchedItem(pageItem);
        }
      } catch (err: any) {
        setUrlFetchError(err.message || "Failed to fetch from URL");
      } finally {
        setIsUrlFetching(false);
      }
    };

    const timeoutId = setTimeout(fetchFromUrl, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const loadMore = async () => {
    if (
      !hasMoreItems ||
      isLoadingMore ||
      !nextCursor ||
      !notionServiceRef.current
    )
      return;

    setIsLoadingMore(true);
    setLoadingPhase("loading-more");

    try {
      const moreResults = await notionServiceRef.current.loadMoreItems(
        nextCursor,
        10
      );

      setPages((prev) => [...prev, ...moreResults.pages]);
      setDatabases((prev) => [...prev, ...moreResults.databases]);
      setNextCursor(moreResults.nextCursor);
      setHasMoreItems(moreResults.hasMore);
    } catch (err) {
      console.error("Load more failed:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Keep loadMoreRef up to date
  loadMoreRef.current = loadMore;

  // Handle shortcuts that aren't part of standard navigation
  useInput(
    (input, key) => {
      if (isLoading || error || isStartingGrading) return;

      // Global shortcut: 's' to focus search
      if (input === "s" && focusedRegion !== "search") {
        focusRegion("search");
        return;
      }

      // Handle 'g' key to start grading (only for databases when in list)
      if (input === "g" && onStartGrading && focusedRegion === "list") {
        const currentItem = allItems[selectedIndex];
        if (currentItem && "properties" in currentItem) {
          setIsStartingGrading(true);
          setSelectedDatabaseName(currentItem.title);
          onStartGrading(currentItem.id, currentItem.title);
          return;
        }
      }

      // Handle 'c' key to select for collaborator (only for databases when in list)
      if (
        input === "c" &&
        onSelectForCollaborator &&
        focusedRegion === "list"
      ) {
        const currentItem = allItems[selectedIndex];
        if (currentItem && "properties" in currentItem) {
          onSelectForCollaborator(currentItem.id, currentItem.title);
          return;
        }
      }

      // Handle 'd' key to toggle databases only
      if (input === "d") {
        setShowingDatabases(!showingDatabases);
        return;
      }

      // When search is focused and Enter is pressed, select first visible item
      if (focusedRegion === "search" && key.return && displayItems.length > 0) {
        const item = displayItems[0];
        const type = "properties" in item ? "database" : "page";
        onSelect(item.id, item.title, type);
      }

      // Horizontal navigation between footer buttons
      if (key.leftArrow && focusedRegion === "reauth" && onBack) {
        focusRegion("back");
        return;
      }
      if (
        key.rightArrow &&
        focusedRegion === "back" &&
        onAuthenticationRequired
      ) {
        focusRegion("reauth");
        return;
      }
    },
    { isActive: !isLoading && !error && !isStartingGrading }
  );

  if (isStartingGrading) {
    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold color="blue">
          Preparing to Grade Database
        </Text>
        <Box marginTop={1} alignItems="center">
          <Text></Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">
            Setting up grading for "{selectedDatabaseName}"...
          </Text>
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
      <NotionDataLoading phase={loadingPhase} startTime={loadingStartTime} />
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
  const showLoadMoreInViewport =
    hasLoadMoreOption && visibleEndIndex > allItems.length;

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

      {isUrlFetching && (
        <Box marginBottom={1}>
          <Text color="cyan">Fetching from URL...</Text>
        </Box>
      )}

      {urlFetchError && (
        <Box marginBottom={1}>
          <Text color="red">{urlFetchError}</Text>
        </Box>
      )}

      {urlFetchedItem && (
        <Box marginBottom={1}>
          <Text color="green">Found from URL (press Enter to select):</Text>
        </Box>
      )}

      {allItems.length > 0 && (
        <>
          {showScrollIndicatorTop && <Text dimColor> ↑ more above</Text>}

          {displayItems.map((item, displayIndex) => {
            const actualIndex = visibleStartIndex + displayIndex;
            const isSelected =
              focusedRegion === "list" && selectedIndex === actualIndex;
            const isDatabase = "properties" in item;
            const itemType = isDatabase ? "Database" : "Page";
            const canGrade = isDatabase && onStartGrading;
            const canSelectForCollaborator =
              isDatabase && onSelectForCollaborator;

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {item.title}
                </Text>
                <Text dimColor> ({itemType})</Text>
                {isSelected && canGrade && (
                  <Text color="green"> [g to grade]</Text>
                )}
                {isSelected && canSelectForCollaborator && (
                  <Text color="green"> [c to select]</Text>
                )}
              </Box>
            );
          })}

          {showLoadMoreInViewport &&
            (() => {
              const isLoadMoreSelected =
                focusedRegion === "list" && selectedIndex === loadMoreIndex;
              return (
                <Box>
                  <Text
                    color={isLoadMoreSelected ? "blue" : "gray"}
                    bold={isLoadMoreSelected}
                  >
                    {isLoadingMore ? "Loading..." : "Load more..."}
                  </Text>
                </Box>
              );
            })()}

          {showScrollIndicatorBottom && !showLoadMoreInViewport && (
            <Text dimColor> ↓ more below</Text>
          )}
        </>
      )}

      <Text></Text>
      <SearchInput
        value={searchTerm}
        placeholder="Search or paste Notion URL..."
        isFocused={isSearchFocused}
        onChange={(value) => inputSetValue("search", value)}
      />
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
            <Text
              color={isReauthFocused ? "blue" : "gray"}
              bold={isReauthFocused}
            >
              Re-authorize Notion
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
