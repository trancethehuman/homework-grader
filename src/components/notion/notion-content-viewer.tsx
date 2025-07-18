import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { NotionService } from "../../lib/notion/notion-service.js";
import { NotionFormatter, FormattedBlock } from "../../lib/notion/notion-formatter.js";

interface NotionContentViewerProps {
  pageId: string;
  pageTitle: string;
  onComplete: () => void;
  onNavigate?: (pageId: string, pageTitle: string, contentType?: string) => void;
  contentType?: string;
}

export const NotionContentViewer: React.FC<NotionContentViewerProps> = ({
  pageId,
  pageTitle,
  onComplete,
  onNavigate,
  contentType,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<any>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showingContent, setShowingContent] = useState(false);
  const [navigableItems, setNavigableItems] = useState<FormattedBlock[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [propertiesExpanded, setPropertiesExpanded] = useState(false);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setIsLoading(true);
        const notionService = new NotionService();
        
        // Use the correct API based on content type
        let pageContent;
        if (contentType === "database") {
          pageContent = await notionService.getDatabaseContent(pageId);
        } else if (contentType === "page") {
          pageContent = await notionService.getPageContentDirect(pageId);
        } else {
          // Fallback to the original logic for unknown types
          pageContent = await notionService.getPageContent(pageId);
        }

        setContent(pageContent);
        
        // Find navigable items (child pages, databases, and database entries)
        const formatted = NotionFormatter.formatContent(pageContent);
        const navItems = formatted.blocks.filter(block => 
          block.type === "child_database" || block.type === "child_page" || block.type === "database_entry"
        );
        setNavigableItems(navItems);
        
        // If there are navigable items, show content selection
        if (navItems.length > 0) {
          setShowingContent(true);
        }
        
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
  }, [pageId, pageTitle, contentType]);

  // Handle input for navigation
  useInput((input, key) => {
    if (isLoading || error) return;

    if (showingContent && navigableItems.length > 0) {
      const totalPages = Math.ceil(navigableItems.length / itemsPerPage);
      const startIndex = currentPage * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, navigableItems.length);
      const currentPageItems = navigableItems.slice(startIndex, endIndex);
      
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
          const newIndex = Math.min(navigableItems.length - 1, prev + 1);
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
        setSelectedIndex(Math.min(navigableItems.length - 1, (currentPage + 1) * itemsPerPage));
      } else if (key.return) {
        const selectedItem = navigableItems[selectedIndex];
        if (selectedItem && onNavigate) {
          if (selectedItem.type === "database_entry") {
            // For database entries, navigate directly using the entry ID (these are pages)
            const childId = selectedItem.id;
            const childTitle = selectedItem.title || selectedItem.content;
            onNavigate(childId, childTitle, "page");
          } else {
            // For child pages and databases, find the matching block
            const originalBlocks = content.blocks || [];
            const matchingBlock = originalBlocks.find((block: any) => {
              const blockTitle = block.child_database?.title || block.child_page?.title;
              const itemTitle = selectedItem.content.replace(/^(📊|📄) /, '');
              return blockTitle === itemTitle && 
                     (block.type === "child_database" || block.type === "child_page");
            });
            
            if (matchingBlock) {
              const childId = matchingBlock.id;
              let childTitle = selectedItem.content.replace(/^(📊|📄) /, '');
              let contentType = "page";
              
              // Try to get the actual title from the block and determine type
              if (matchingBlock.type === "child_database") {
                childTitle = matchingBlock.child_database?.title || childTitle;
                contentType = "database";
              } else if (matchingBlock.type === "child_page") {
                childTitle = matchingBlock.child_page?.title || childTitle;
                contentType = "page";
              }
              
              onNavigate(childId, childTitle, contentType);
            }
          }
        }
      } else if (input === 'b' || key.escape) {
        // Go back - complete the current view
        onComplete();
      } else if (input === 'p') {
        // Toggle properties expansion
        setPropertiesExpanded(!propertiesExpanded);
      }
    } else {
      // No navigable items, handle property expansion or complete
      if (input === 'p') {
        setPropertiesExpanded(!propertiesExpanded);
      } else {
        onComplete();
      }
    }
  });

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
  const isDatabase = content.type === "database";
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
        <Text bold>Properties:</Text> {formatted.properties.length}
      </Text>
      <Text>
        <Text bold>Last edited:</Text> {formatted.lastEditedTime}
      </Text>
      <Text></Text>
      
      {formatted.properties.length > 0 && (
        <>
          <Text color="cyan" bold>Properties:</Text>
          {formatted.properties.slice(0, 5).map((prop, index) => (
            <Text key={index} dimColor>
              • {prop.name}: {prop.value} {prop.type !== 'rich_text' && `(${prop.type})`}
            </Text>
          ))}
          {formatted.properties.length > 5 && (
            <Text dimColor>... and {formatted.properties.length - 5} more properties</Text>
          )}
          <Text></Text>
        </>
      )}
      <Text color="yellow">
        Content loaded successfully.
      </Text>
      <Text></Text>

      {showingContent && navigableItems.length > 0 && (
        <>
          <Text color="cyan" bold>
            Navigate to child pages/databases:
          </Text>
          <Text dimColor>Use ↑/↓ arrows to navigate, ←/→ to change pages, Enter to select, 'b' to go back</Text>
          <Text></Text>
          
          {(() => {
            const totalPages = Math.ceil(navigableItems.length / itemsPerPage);
            const startIndex = currentPage * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, navigableItems.length);
            const currentPageItems = navigableItems.slice(startIndex, endIndex);
            
            return (
              <>
                {totalPages > 1 && (
                  <Text dimColor>
                    Page {currentPage + 1} of {totalPages} | Items {startIndex + 1}-{endIndex} of {navigableItems.length}
                  </Text>
                )}
                <Text></Text>
                
                {currentPageItems.map((item, pageIndex) => {
                  const actualIndex = startIndex + pageIndex;
                  const isSelected = actualIndex === selectedIndex;
                  return (
                    <Box key={item.id} marginBottom={1}>
                      <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                        {isSelected ? "→ " : "  "}
                        {item.content}
                      </Text>
                    </Box>
                  );
                })}
              </>
            );
          })()}
          
          <Text></Text>
          <Text dimColor>
            Press Enter to navigate, ←/→ for pages, 'b' to go back, Ctrl+C to exit
          </Text>
        </>
      )}

      {(!showingContent || navigableItems.length === 0) && (
        <Text dimColor>
          Press any key to continue...
        </Text>
      )}
    </Box>
  );
};