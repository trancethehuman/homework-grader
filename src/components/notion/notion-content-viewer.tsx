import React, { useState, useEffect, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService } from "../../lib/notion/notion-service.js";
import { NotionOAuthClient } from "../../lib/notion/oauth-client.js";
import {
  NotionFormatter,
  FormattedBlock,
} from "../../lib/notion/notion-formatter.js";
import { BackButton, useBackNavigation } from "../ui/back-button.js";
import { DebugLogger } from "../../lib/debug-logger.js";
import { SearchInput } from "../ui/search-input.js";

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
  onBack?: () => void;
  contentType?: string;
}

export const NotionContentViewer: React.FC<NotionContentViewerProps> = ({
  pageId,
  pageTitle,
  onComplete,
  onNavigate,
  onStartGrading,
  onBack,
  contentType,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [navigableItems, setNavigableItems] = useState<FormattedBlock[]>([]);
  const [showProperties, setShowProperties] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isBackFocused, setIsBackFocused] = useState(false);
  const [loadingDots, setLoadingDots] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const viewportSize = 8;

  const { handleBackInput } = useBackNavigation(() => onBack?.(), !!onBack);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return navigableItems;
    }
    return navigableItems.filter((item) =>
      (item.title || item.content).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [navigableItems, searchTerm]);

  const allItems = filteredItems;
  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(scrollOffset + viewportSize, allItems.length);
  const displayItems = allItems.slice(visibleStartIndex, visibleEndIndex);

  // Animate loading dots
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

        DebugLogger.debugAuth(`Checking existing Notion authentication...`);
        const oauth = new NotionOAuthClient();

        DebugLogger.debugAuth("Ensuring authentication...");
        const token = await oauth.ensureAuthenticated();
        const notionService = new NotionService(token.access_token);

        const validation = await notionService.validateToken();
        if (!validation.valid) {
          throw new Error(validation.error || "Token validation failed");
        }
        DebugLogger.debugAuth("Notion authentication is valid");

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
            errorMessage = "Token is invalid or expired. Please re-authenticate with Notion.";
          } else if (err.message.includes("refresh")) {
            errorMessage = "Failed to refresh authentication. Please try again.";
            shouldRetry = true;
          } else if (err.message.includes("network") || err.message.includes("fetch")) {
            errorMessage = "Network error. Please check your connection and try again.";
            shouldRetry = true;
          } else if (err.message.includes("rate limit")) {
            errorMessage = "Rate limited by Notion. Please wait a moment and try again.";
            shouldRetry = true;
          } else if (err.message.includes("permission")) {
            errorMessage = "Permission denied. Please ensure the integration has access to this content.";
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
    setSelectedIndex(0);
    setScrollOffset(0);
  }, [searchTerm]);

  useInput((input, key) => {
    if (isLoading || error) return;

    if (handleBackInput(input, key)) {
      return;
    }

    // Handle 'i' key to toggle properties view
    if (input === "i") {
      setShowProperties(!showProperties);
      return;
    }

    // When showing properties, only handle 'i' to close and 'b' to go back
    if (showProperties) {
      if (input === "b" || key.escape) {
        onComplete(content);
      }
      return;
    }

    // Handle 's' key to focus search
    if (input === "s" && !isSearchFocused) {
      setIsSearchFocused(true);
      setSelectedIndex(0);
      setScrollOffset(0);
      return;
    }

    // Handle 'g' key to start grading the entire database
    if (input === "g" && onStartGrading && contentType === "database") {
      onStartGrading(pageId, pageTitle);
      return;
    }

    // Handle 'g' key for individual items
    if (
      input === "g" &&
      onStartGrading &&
      navigableItems.length > 0 &&
      !isSearchFocused &&
      contentType !== "database"
    ) {
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
          const originalBlocks = content.blocks || [];
          const matchingBlock = originalBlocks.find((block: any) => {
            const blockTitle =
              block.child_database?.title || block.child_page?.title;
            const itemTitle = selectedItem.content.replace(/^(📊|📄) /, "");
            return blockTitle === itemTitle && block.type === "child_database";
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

    // Handle search input when search is focused
    if (isSearchFocused) {
      if (key.return) {
        if (allItems.length > 0) {
          const item = allItems[selectedIndex];
          handleItemSelect(item);
        }
        return;
      }

      // Up arrow from search (at bottom) goes to last item in list
      if (key.upArrow) {
        if (allItems.length > 0) {
          setIsSearchFocused(false);
          const lastIndex = allItems.length - 1;
          setSelectedIndex(lastIndex);
          // Ensure last item is visible
          if (lastIndex >= viewportSize) {
            setScrollOffset(lastIndex - viewportSize + 1);
          }
        }
        return;
      }

      // Down arrow from search goes to back button
      if (key.downArrow && onBack) {
        setIsSearchFocused(false);
        setIsBackFocused(true);
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

    // Handle back button focused
    if (isBackFocused) {
      if (key.upArrow) {
        setIsBackFocused(false);
        setIsSearchFocused(true);
        return;
      }
      if (key.return) {
        onBack?.();
        return;
      }
      return;
    }

    // Handle navigation in list (not search focused)
    if (!isSearchFocused) {
      if (key.upArrow) {
        // Up arrow at first item does nothing (search is at bottom, not top)
        if (selectedIndex > 0) {
          const newIndex = selectedIndex - 1;
          setSelectedIndex(newIndex);
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        }
      } else if (key.downArrow) {
        if (selectedIndex < allItems.length - 1) {
          const newIndex = selectedIndex + 1;
          setSelectedIndex(newIndex);
          if (newIndex >= scrollOffset + viewportSize) {
            setScrollOffset(newIndex - viewportSize + 1);
          }
        } else {
          // Down arrow at last item focuses search (search is at bottom)
          setIsSearchFocused(true);
        }
      } else if (key.return) {
        if (selectedIndex < allItems.length) {
          handleItemSelect(allItems[selectedIndex]);
        }
      } else if (input === "b" || key.escape) {
        onComplete(content);
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        // Auto-focus search and type when pressing letters (not shortcuts)
        // Reserved shortcuts: b (back), s (search), g (grade), i (properties)
        if (!['b', 's', 'g', 'i'].includes(input.toLowerCase())) {
          setIsSearchFocused(true);
          setSearchTerm(searchTerm + input);
        }
      }
    }
  });

  const handleItemSelect = (item: FormattedBlock) => {
    if (!onNavigate) return;

    if (item.type === "database_entry") {
      const childId = item.id;
      const childTitle = item.title || item.content;
      onNavigate(childId, childTitle, "page");
    } else {
      const originalBlocks = content.blocks || [];
      const matchingBlock = originalBlocks.find((block: any) => {
        const blockTitle =
          block.child_database?.title || block.child_page?.title;
        const itemTitle = item.content.replace(/^(📊|📄) /, "");
        return (
          blockTitle === itemTitle &&
          (block.type === "child_database" || block.type === "child_page")
        );
      });

      if (matchingBlock) {
        const childId = matchingBlock.id;
        let childTitle = item.content.replace(/^(📊|📄) /, "");
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

  // Loading state - show inline loading with title
  if (isLoading) {
    const displayType = contentType === "database" ? "Database" : "Page";
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="blue" bold>
            {pageTitle}
          </Text>
          <Text color="yellow"> Loading{loadingDots}</Text>
        </Box>
        <Text dimColor>
          {displayType}
        </Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        <Text dimColor>Fetching content...</Text>
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

  // Properties View (replaces list when 'i' is pressed)
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

  // No navigable items view
  if (navigableItems.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          {formatted.icon} {formatted.title}
        </Text>
        <Text dimColor>{displayType}</Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        <Text dimColor>No child pages or databases found.</Text>
      </Box>
    );
  }

  const showScrollIndicatorTop = scrollOffset > 0;
  const showScrollIndicatorBottom = visibleEndIndex < allItems.length;

  // Default list view with scrolling
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
          {showScrollIndicatorTop && (
            <Text dimColor>  ↑ more above</Text>
          )}

          {displayItems.map((item, displayIndex) => {
            const actualIndex = visibleStartIndex + displayIndex;
            const isSelected = !isSearchFocused && selectedIndex === actualIndex;
            const canGrade =
              onStartGrading &&
              contentType !== "database" &&
              (item.type === "child_database" || item.type === "database_entry");

            return (
              <Box key={item.id}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}{item.content}
                </Text>
                {isSelected && canGrade && (
                  <Text color="green"> [g to grade]</Text>
                )}
              </Box>
            );
          })}

          {showScrollIndicatorBottom && (
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
            {isBackFocused ? "→ " : "  "}← back
          </Text>
        </Box>
      )}
    </Box>
  );
};
