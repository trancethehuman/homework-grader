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
  const [currentPage, setCurrentPage] = useState(0);
  const [showProperties, setShowProperties] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isViewAllMode, setIsViewAllMode] = useState(false);
  const [loadingDots, setLoadingDots] = useState("");
  const itemsPerPage = 10;
  const maxSearchResults = 3;

  const { handleBackInput } = useBackNavigation(() => onBack?.(), !!onBack);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return navigableItems;
    }
    return navigableItems.filter((item) =>
      (item.title || item.content).toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [navigableItems, searchTerm]);

  const displayItems = isViewAllMode ? navigableItems : filteredItems;
  const searchResultsItems = filteredItems.slice(0, maxSearchResults);

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
      setIsViewAllMode(false);
      setIsSearchFocused(true);
      setSelectedIndex(0);
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
      const items = isViewAllMode ? displayItems : searchResultsItems;
      const selectedItem = items[selectedIndex];
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
    if (isSearchFocused && !isViewAllMode) {
      if (key.return) {
        if (searchResultsItems.length > 0) {
          const item = searchResultsItems[0];
          handleItemSelect(item);
        }
        return;
      }

      if (key.downArrow) {
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
          handleItemSelect(displayItems[selectedIndex]);
        }
      } else if (input === "b" || key.escape) {
        onComplete(content);
      }
      return;
    }

    // Handle navigation in search results (not view all mode, not search focused)
    if (!isViewAllMode && !isSearchFocused) {
      const maxIndex = searchResultsItems.length;

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
          handleItemSelect(searchResultsItems[selectedIndex]);
        } else if (selectedIndex === searchResultsItems.length) {
          setIsViewAllMode(true);
          setSelectedIndex(0);
          setCurrentPage(0);
        }
      } else if (input === "b" || key.escape) {
        onComplete(content);
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
        <Text></Text>
        <Text dimColor>'b' back, Ctrl+C to exit</Text>
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
        <Text></Text>
        <Text dimColor>'b' go back, Ctrl+C to exit</Text>
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
                • {prop.name}: {prop.value}{" "}
                {prop.type !== "rich_text" && `(${prop.type})`}
              </Text>
            ))}
          </>
        ) : (
          <Text dimColor>No properties found</Text>
        )}

        <Text></Text>
        <Text dimColor>
          'i' back to list, 'b' go back, Ctrl+C to exit
        </Text>
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
        <Text>
          {displayType} • {formatted.properties.length} properties
        </Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

        <Text dimColor>No child pages or databases found.</Text>
        <Text></Text>
        <Text dimColor>
          'i' view properties
          {onStartGrading && contentType === "database" && ", 'g' grade database"}
          , 'b' go back, Ctrl+C to exit
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
          {formatted.icon} {formatted.title}
        </Text>
        <Text>
          {displayType} • {navigableItems.length} items
        </Text>
        <Text></Text>

        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

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
          const canGrade =
            onStartGrading &&
            contentType !== "database" &&
            (item.type === "child_database" || item.type === "database_entry");

          return (
            <Box key={item.id} marginBottom={1}>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {item.content}
                {isSelected && canGrade && (
                  <Text color="green"> [Press 'g' to grade]</Text>
                )}
              </Text>
            </Box>
          );
        })}

        <Text></Text>
        <SearchInput
          value={searchTerm}
          placeholder="Search items..."
          isFocused={isSearchFocused}
          onChange={setSearchTerm}
        />
        <Text dimColor>
          ↑/↓ navigate, ←/→ pages, Enter select, 's' search, 'i' info
          {onStartGrading && contentType === "database" && ", 'g' grade database"}
          {onStartGrading && contentType !== "database" && ", 'g' grade item"}
          , 'b' back
        </Text>
      </Box>
    );
  }

  // Default Search Mode
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        {formatted.icon} {formatted.title}
      </Text>
      <Text>
        {displayType} • {navigableItems.length} items
      </Text>
      <Text></Text>

      <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

      {searchTerm && filteredItems.length === 0 ? (
        <Box marginBottom={1}>
          <Text color="yellow">No results found for "{searchTerm}"</Text>
        </Box>
      ) : (
        <>
          {searchResultsItems.map((item, index) => {
            const isSelected = !isSearchFocused && selectedIndex === index;
            const canGrade =
              onStartGrading &&
              contentType !== "database" &&
              (item.type === "child_database" || item.type === "database_entry");

            return (
              <Box key={item.id} marginBottom={1}>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}
                  {item.content}
                  {isSelected && canGrade && (
                    <Text color="green"> [Press 'g' to grade]</Text>
                  )}
                </Text>
              </Box>
            );
          })}

          {filteredItems.length > maxSearchResults && (
            <Box marginBottom={1}>
              <Text
                color={
                  !isSearchFocused && selectedIndex === searchResultsItems.length
                    ? "blue"
                    : "gray"
                }
                bold={
                  !isSearchFocused && selectedIndex === searchResultsItems.length
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
      <SearchInput
        value={searchTerm}
        placeholder="Search items..."
        isFocused={isSearchFocused}
        onChange={setSearchTerm}
      />
      <Text dimColor>
        Type to search, ↑/↓ navigate, Enter select, 'i' info
        {onStartGrading && contentType === "database" && ", 'g' grade database"}
        {onStartGrading && contentType !== "database" && ", 'g' grade item"}
        , 'b' back
      </Text>
    </Box>
  );
};
