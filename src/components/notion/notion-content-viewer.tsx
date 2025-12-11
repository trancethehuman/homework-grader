import React, { useState, useEffect, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService } from "../../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../../lib/notion/oauth-client.js";
import {
  NotionFormatter,
  FormattedBlock,
} from "../../lib/notion/notion-formatter.js";
import { BackButton } from "../ui/back-button.js";
import { DebugLogger } from "../../lib/utils/debug-logger.js";
import { SearchInput } from "../ui/search-input.js";
import { NotionTokenStorage } from "../../lib/notion/notion-token-storage.js";
import {
  useFocusNavigation,
  ListRegionState,
  InputRegionState,
} from "../../hooks/index.js";

interface NotionContentViewerProps {
  pageId: string;
  pageTitle: string;
  onComplete: (content?: any) => void;
  onNavigate?: (
    pageId: string,
    pageTitle: string,
    contentType?: string
  ) => void;
  onStartGrading?: (pageId: string, pageTitle: string) => void;
  onSelectForCollaborator?: (pageId: string, pageTitle: string) => void;
  onAuthenticationRequired?: () => void;
  onBack?: () => void;
  contentType?: string;
}

type LoadingPhase = "proxy" | "auth" | "content";

export const NotionContentViewer: React.FC<NotionContentViewerProps> = ({
  pageId,
  pageTitle,
  onComplete,
  onNavigate,
  onStartGrading,
  onSelectForCollaborator,
  onAuthenticationRequired,
  onBack,
  contentType,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("proxy");
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<any>(null);
  const [navigableItems, setNavigableItems] = useState<FormattedBlock[]>([]);
  const [showProperties, setShowProperties] = useState(false);
  const [loadingDots, setLoadingDots] = useState("");

  const viewportSize = 8;

  const handleItemSelect = (item: FormattedBlock) => {
    if (!onNavigate) return;

    if (item.type === "database_entry") {
      const childId = item.id;
      const childTitle = item.title || item.content;
      onNavigate(childId, childTitle, "page");
    } else {
      const originalBlocks = content?.blocks || [];
      const matchingBlock = originalBlocks.find((block: any) => {
        const blockTitle =
          block.child_database?.title || block.child_page?.title;
        const itemTitle = item.content.replace(/^(|) /, "");
        return (
          blockTitle === itemTitle &&
          (block.type === "child_database" || block.type === "child_page")
        );
      });

      if (matchingBlock) {
        const childId = matchingBlock.id;
        let childTitle = item.content.replace(/^(|) /, "");
        let itemContentType = "page";

        if (matchingBlock.type === "child_database") {
          childTitle = matchingBlock.child_database?.title || childTitle;
          itemContentType = "database";
        } else if (matchingBlock.type === "child_page") {
          childTitle = matchingBlock.child_page?.title || childTitle;
          itemContentType = "page";
        }

        onNavigate(childId, childTitle, itemContentType);
      }
    }
  };

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
        itemCount: navigableItems.length,
        viewportSize,
        enabled: navigableItems.length > 0,
        onSelect: (index: number) => {
          if (index < navigableItems.length) {
            handleItemSelect(navigableItems[index]);
          }
        },
      },
      {
        id: "search",
        type: "input",
        reservedKeys: ["s", "g", "c", "i"],
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
    initialFocus: "list",
    disabled: isLoading || !!error || showProperties,
  });

  const listState = regionStates.list as ListRegionState | undefined;
  const searchState = regionStates.search as InputRegionState;

  const searchTerm = searchState?.value ?? "";
  const selectedIndex = listState?.selectedIndex ?? 0;
  const scrollOffset = listState?.scrollOffset ?? 0;

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return navigableItems;
    }
    return navigableItems.filter((item) =>
      (item.title || item.content)
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
    );
  }, [navigableItems, searchTerm]);

  const allItems = filteredItems;
  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(
    scrollOffset + viewportSize,
    allItems.length
  );
  const displayItems = allItems.slice(visibleStartIndex, visibleEndIndex);

  const isSearchFocused = focusedRegion === "search";
  const isBackFocused = focusedRegion === "back";
  const isReauthFocused = focusedRegion === "reauth";

  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setLoadingPhase("proxy");

        DebugLogger.debugAuth(`Checking existing Notion authentication...`);
        const oauth = new NotionOAuthClient();

        await oauth.warmUpProxy();
        setLoadingPhase("auth");

        DebugLogger.debugAuth("Ensuring authentication...");
        const token = await oauth.ensureAuthenticated();
        const notionService = new NotionService(token.access_token);

        const validation = await notionService.validateToken();
        if (!validation.valid) {
          throw new Error(validation.error || "Token validation failed");
        }
        DebugLogger.debugAuth("Notion authentication is valid");

        setLoadingPhase("content");

        let pageContent;
        if (contentType === "database") {
          pageContent = await notionService.getDatabaseContent(pageId);
        } else if (contentType === "page") {
          pageContent = await notionService.getPageContentDirect(pageId);
        } else {
          pageContent = await notionService.getPageContent(pageId);
        }

        setContent(pageContent);

        const formatted = NotionFormatter.formatContent(pageContent);
        const navItems = formatted.blocks.filter(
          (block) =>
            block.type === "child_database" ||
            block.type === "child_page" ||
            block.type === "database_entry"
        );
        setNavigableItems(navItems);

        setError(null);
      } catch (err) {
        let errorMessage = "Failed to fetch content";
        let shouldRetry = false;

        if (err instanceof Error) {
          if (err.message.includes("Token is invalid or expired")) {
            errorMessage =
              "Token is invalid or expired. Please re-authenticate with Notion.";
          } else if (err.message.includes("refresh")) {
            errorMessage =
              "Failed to refresh authentication. Please try again.";
            shouldRetry = true;
          } else if (
            err.message.includes("network") ||
            err.message.includes("fetch")
          ) {
            errorMessage =
              "Network error. Please check your connection and try again.";
            shouldRetry = true;
          } else if (err.message.includes("rate limit")) {
            errorMessage =
              "Rate limited by Notion. Please wait a moment and try again.";
            shouldRetry = true;
          } else if (err.message.includes("permission")) {
            errorMessage =
              "Permission denied. Please ensure the integration has access to this content.";
          } else {
            errorMessage = err.message;
          }
        }

        setError(errorMessage);
        console.error(`Error fetching Notion content for ${pageTitle}:`, err);

        if (shouldRetry) {
          console.log("This error might be temporary - user should try again");
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchContent();
  }, [pageId, pageTitle, contentType]);

  useEffect(() => {
    listSelectIndex("list", 0);
  }, [searchTerm, listSelectIndex]);

  useInput(
    (input, key) => {
      if (isLoading || error) return;

      if (input === "i") {
        setShowProperties(!showProperties);
        return;
      }

      if (showProperties) {
        if (key.escape) {
          onComplete(content);
        }
        return;
      }

      if (input === "s" && focusedRegion !== "search") {
        focusRegion("search");
        return;
      }

      if (input === "g" && onStartGrading) {
        if (contentType === "database") {
          onStartGrading(pageId, pageTitle);
          return;
        }

        if (focusedRegion === "list" && navigableItems.length > 0) {
          const selectedItem = allItems[selectedIndex];
          if (
            selectedItem &&
            (selectedItem.type === "child_database" ||
              selectedItem.type === "database_entry")
          ) {
            let childId, childTitle;

            if (selectedItem.type === "database_entry") {
              childId = selectedItem.id;
              childTitle = selectedItem.title || selectedItem.content;
            } else {
              const originalBlocks = content?.blocks || [];
              const matchingBlock = originalBlocks.find((block: any) => {
                const blockTitle =
                  block.child_database?.title || block.child_page?.title;
                const itemTitle = selectedItem.content.replace(/^(|) /, "");
                return (
                  blockTitle === itemTitle && block.type === "child_database"
                );
              });

              if (matchingBlock) {
                childId = matchingBlock.id;
                childTitle =
                  matchingBlock.child_database?.title || selectedItem.content;
              }
            }

            if (childId && childTitle) {
              onStartGrading(childId, childTitle);
              return;
            }
          }
        }
      }

      if (input === "c" && onSelectForCollaborator) {
        if (contentType === "database") {
          onSelectForCollaborator(pageId, pageTitle);
          return;
        }

        if (focusedRegion === "list" && navigableItems.length > 0) {
          const selectedItem = allItems[selectedIndex];
          if (
            selectedItem &&
            (selectedItem.type === "child_database" ||
              selectedItem.type === "database_entry")
          ) {
            let childId, childTitle;

            if (selectedItem.type === "database_entry") {
              childId = selectedItem.id;
              childTitle = selectedItem.title || selectedItem.content;
            } else {
              const originalBlocks = content?.blocks || [];
              const matchingBlock = originalBlocks.find((block: any) => {
                const blockTitle =
                  block.child_database?.title || block.child_page?.title;
                const itemTitle = selectedItem.content.replace(/^(|) /, "");
                return (
                  blockTitle === itemTitle && block.type === "child_database"
                );
              });

              if (matchingBlock) {
                childId = matchingBlock.id;
                childTitle =
                  matchingBlock.child_database?.title || selectedItem.content;
              }
            }

            if (childId && childTitle) {
              onSelectForCollaborator(childId, childTitle);
              return;
            }
          }
        }
      }

      if (key.escape && focusedRegion === "list") {
        onComplete(content);
        return;
      }

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
    { isActive: !isLoading && !error }
  );

  if (isLoading) {
    const displayType = contentType === "database" ? "Database" : "Page";
    const loadingMessage =
      loadingPhase === "proxy"
        ? "Connecting to server (may take up to 60s on cold start)"
        : loadingPhase === "auth"
        ? "Authenticating with Notion"
        : "Fetching content";
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="blue" bold>
            {pageTitle}
          </Text>
          <Text color="yellow"> Loading{loadingDots}</Text>
        </Box>
        <Text dimColor>{displayType}</Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        <Text dimColor>
          {loadingMessage}
          {loadingDots}
        </Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          {pageTitle}
        </Text>
        <Text color="red">Error</Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        <Text color="red">{error}</Text>
      </Box>
    );
  }

  const formatted = NotionFormatter.formatContent(content);
  const isDatabase = content.type === "database";
  const displayType = isDatabase ? "Database" : "Page";

  if (showProperties) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          {formatted.icon} {formatted.title} - Properties
        </Text>
        <Text dimColor>Press 'i' to return to list</Text>
        <Text></Text>

        {formatted.properties.length > 0 ? (
          <>
            {formatted.properties.map((prop, index) => (
              <Text key={index} dimColor>
                * {prop.name}: {prop.value}{" "}
                {prop.type !== "rich_text" && `(${prop.type})`}
              </Text>
            ))}
          </>
        ) : (
          <Text dimColor>No properties found</Text>
        )}
      </Box>
    );
  }

  if (navigableItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          {formatted.icon} {formatted.title}
        </Text>
        <Text dimColor>{displayType}</Text>
        <Text></Text>

        <Text dimColor>No child pages or databases found.</Text>

        <Text></Text>
        <Box justifyContent="space-between">
          {onBack ? (
            <Box>
              <Text
                color={isBackFocused ? "blue" : "gray"}
                bold={isBackFocused}
              >
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
  }

  const showScrollIndicatorTop = scrollOffset > 0;
  const showScrollIndicatorBottom = visibleEndIndex < allItems.length;

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        {formatted.icon} {formatted.title}
      </Text>
      <Text dimColor>{displayType}</Text>
      <Text></Text>

      {searchTerm && filteredItems.length === 0 ? (
        <Box marginBottom={1}>
          <Text color="yellow">No results found for "{searchTerm}"</Text>
        </Box>
      ) : (
        <>
          {showScrollIndicatorTop && <Text dimColor> ↑ more above</Text>}

          {displayItems.map((item, displayIndex) => {
            const actualIndex = visibleStartIndex + displayIndex;
            const isSelected =
              focusedRegion === "list" && selectedIndex === actualIndex;
            const canGrade =
              onStartGrading &&
              contentType !== "database" &&
              (item.type === "child_database" ||
                item.type === "database_entry");
            const canSelectForCollaborator =
              onSelectForCollaborator &&
              contentType !== "database" &&
              (item.type === "child_database" ||
                item.type === "database_entry");

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {item.content}
                </Text>
                {isSelected && canGrade && (
                  <Text color="green"> [g to grade]</Text>
                )}
                {isSelected && canSelectForCollaborator && (
                  <Text color="green"> [c to select]</Text>
                )}
              </Box>
            );
          })}

          {showScrollIndicatorBottom && <Text dimColor> ↓ more below</Text>}
        </>
      )}

      <Text></Text>
      <SearchInput
        value={searchTerm}
        placeholder="Search..."
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
