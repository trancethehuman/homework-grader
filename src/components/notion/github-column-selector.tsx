import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { GitHubUrlDetector, GitHubUrlCandidate, GitHubUrlDetectionResult } from "../../lib/github/github-url-detector.js";
import { BackButton, useBackNavigation } from "../ui/back-button.js";
import { HelpFooter, ConfidenceBadge, ListRowDetails } from "../ui/index.js";

interface GitHubColumnSelectorProps {
  notionContent: any;
  onSelect: (selectedProperty: any, githubUrls: Array<{url: string, pageId: string}> | string[]) => void;
  onBack?: () => void;
  onError: (error: string) => void;
}

export const GitHubColumnSelector: React.FC<GitHubColumnSelectorProps> = ({
  notionContent,
  onSelect,
  onBack,
  onError,
}) => {
  const [detectionResult, setDetectionResult] = useState<GitHubUrlDetectionResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const { handleBackInput } = useBackNavigation(
    () => onBack?.(),
    !!onBack
  );

  useEffect(() => {
    const detectUrls = async () => {
      try {
        setIsLoading(true);
        const result = GitHubUrlDetector.detectGitHubUrls(notionContent);
        setDetectionResult(result);
        
        if (result.candidates.length === 0) {
          onError("No GitHub URLs found in this Notion page/database. Please make sure it contains GitHub repository links.");
          return;
        }

        // Auto-select if there's only one candidate with high confidence (80+)
        if (result.candidates.length === 1 && result.topCandidate && result.topCandidate.confidence >= 80) {
          const property = findPropertyByName(result.topCandidate.propertyName);
          if (property) {
            // Use page IDs for database content, fallback to simple URLs for other content
            const urls = notionContent?.type === "database" ? 
              extractUrlsWithPageIds(result.topCandidate.propertyName) :
              extractUrlsFromDatabaseProperty(result.topCandidate.propertyName);
            
            // Auto-proceed with the high-confidence single option
            console.log(`Auto-selecting high-confidence GitHub column: ${result.topCandidate.propertyName} (${result.topCandidate.confidence}% confidence)`);
            onSelect(property, urls);
            return;
          }
        }

        // Set preview URLs for the top candidate
        if (result.topCandidate) {
          const property = findPropertyByName(result.topCandidate.propertyName);
          if (property) {
            const urls = notionContent?.type === "database" ? 
              extractUrlsWithPageIds(result.topCandidate.propertyName) :
              extractUrlsFromDatabaseProperty(result.topCandidate.propertyName);
            
            // Extract just URLs for preview display
            const previewUrls = Array.isArray(urls) && urls.length > 0 && typeof urls[0] === 'object' 
              ? (urls as Array<{url: string, pageId: string}>).map(item => item.url)
              : urls as string[];
            setPreviewUrls(previewUrls.slice(0, 5)); // Show up to 5 URLs
          }
        }
      } catch (error) {
        onError(`Failed to analyze Notion content: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoading(false);
      }
    };

    detectUrls();
  }, [notionContent, onError]);

  const findPropertyByName = (propertyName: string) => {
    // Handle database content structure
    if (notionContent?.type === "database" && notionContent.database?.properties) {
      return notionContent.database.properties[propertyName] || null;
    }
    
    // Handle legacy formatted content structure
    if (notionContent?.object?.properties) {
      return notionContent.object.properties.find((prop: any) => prop.name === propertyName);
    }
    
    return null;
  };

  const extractUrlsWithPageIds = (propertyName: string): Array<{url: string, pageId: string}> => {
    // Handle database content structure with page IDs
    if (notionContent?.type === "database") {
      const propertyDefinition = notionContent.database?.properties?.[propertyName];
      const entries = notionContent.entries || [];
      
      if (!propertyDefinition) return [];
      
      const urlsWithIds: Array<{url: string, pageId: string}> = [];
      
      // Extract URLs from all database entries for this property
      for (const entry of entries) {
        const propertyValue = entry.properties?.[propertyName];
        if (!propertyValue) continue;
        
        let valueText = '';
        
        // Extract the actual value based on property type
        switch (propertyDefinition.type) {
          case 'url':
            valueText = propertyValue.url || '';
            break;
          case 'rich_text':
            valueText = (propertyValue.rich_text || [])
              .map((rt: any) => rt.plain_text || rt.text?.content || '')
              .join('');
            break;
          case 'title':
            valueText = (propertyValue.title || [])
              .map((rt: any) => rt.plain_text || rt.text?.content || '')
              .join('');
            break;
          default:
            // For other types, try to extract text representation
            if (typeof propertyValue === 'string') {
              valueText = propertyValue;
            } else if (propertyValue.plain_text) {
              valueText = propertyValue.plain_text;
            }
        }

        if (valueText) {
          const urls = GitHubUrlDetector.extractGitHubUrls(valueText);
          for (const url of urls) {
            urlsWithIds.push({ url, pageId: entry.id });
          }
        }
      }

      // Remove duplicates by URL while keeping the first occurrence
      const seen = new Set<string>();
      return urlsWithIds.filter(item => {
        if (seen.has(item.url)) {
          return false;
        }
        seen.add(item.url);
        return true;
      });
    }
    
    return [];
  };

  const extractUrlsFromDatabaseProperty = (propertyName: string): string[] => {
    // Handle database content structure
    if (notionContent?.type === "database") {
      const propertyDefinition = notionContent.database?.properties?.[propertyName];
      const entries = notionContent.entries || [];
      
      if (!propertyDefinition) return [];
      
      let allUrls: string[] = [];
      
      // Extract URLs from all database entries for this property
      for (const entry of entries) {
        if (entry.properties && entry.properties[propertyName]) {
          const propertyValue = entry.properties[propertyName];
          let valueText = '';

          // Extract the actual value based on property type
          switch (propertyDefinition.type) {
            case 'url':
              valueText = propertyValue.url || '';
              break;
            case 'rich_text':
              valueText = (propertyValue.rich_text || [])
                .map((rt: any) => rt.plain_text || rt.text?.content || '')
                .join('');
              break;
            case 'title':
              valueText = (propertyValue.title || [])
                .map((rt: any) => rt.plain_text || rt.text?.content || '')
                .join('');
              break;
            default:
              // For other types, try to extract text representation
              if (typeof propertyValue === 'string') {
                valueText = propertyValue;
              } else if (propertyValue.plain_text) {
                valueText = propertyValue.plain_text;
              }
          }

          if (valueText) {
            const urls = GitHubUrlDetector.extractGitHubUrls(valueText);
            allUrls.push(...urls);
          }
        }
      }

      // Remove duplicates
      return Array.from(new Set(allUrls));
    }
    
    // Handle legacy formatted content structure
    const property = findPropertyByName(propertyName);
    if (property) {
      return GitHubUrlDetector.extractGitHubUrlsFromProperty(property);
    }
    
    return [];
  };

  useInput((input, key) => {
    if (isLoading || !detectionResult) return;

    // Handle back navigation first
    if (handleBackInput(input, key)) {
      return;
    }

    const candidates = detectionResult.candidates;

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(candidates.length - 1, selectedIndex + 1));
    } else if (key.return) {
      const selectedCandidate = candidates[selectedIndex];
      if (selectedCandidate) {
        const property = findPropertyByName(selectedCandidate.propertyName);
        if (property) {
          const urls = notionContent?.type === "database" ? 
            extractUrlsWithPageIds(selectedCandidate.propertyName) :
            extractUrlsFromDatabaseProperty(selectedCandidate.propertyName);
          onSelect(property, urls);
        } else {
          onError("Could not find the selected property in the Notion content.");
        }
      }
    } else if (input === 'q' && detectionResult.topCandidate) {
      // Quick start with top candidate
      const property = findPropertyByName(detectionResult.topCandidate.propertyName);
      if (property) {
        const urls = notionContent?.type === "database" ? 
          extractUrlsWithPageIds(detectionResult.topCandidate.propertyName) :
          extractUrlsFromDatabaseProperty(detectionResult.topCandidate.propertyName);
        onSelect(property, urls);
      }
    }
  });

  // Update preview URLs when selection changes
  useEffect(() => {
    if (!detectionResult || !detectionResult.candidates[selectedIndex]) return;
    
    const selectedCandidate = detectionResult.candidates[selectedIndex];
    const property = findPropertyByName(selectedCandidate.propertyName);
    if (property) {
      const urls = notionContent?.type === "database" ? 
        extractUrlsWithPageIds(selectedCandidate.propertyName) :
        extractUrlsFromDatabaseProperty(selectedCandidate.propertyName);
      
      // Extract just URLs for preview display
      const previewUrls = Array.isArray(urls) && urls.length > 0 && typeof urls[0] === 'object' 
        ? (urls as Array<{url: string, pageId: string}>).map(item => item.url)
        : urls as string[];
      setPreviewUrls(previewUrls.slice(0, 5));
    }
  }, [selectedIndex, detectionResult]);

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Analyzing Notion Content for GitHub URLs...
        </Text>
        <Text></Text>
        <Text>Scanning properties and content for GitHub repository links...</Text>
      </Box>
    );
  }

  if (!detectionResult || detectionResult.candidates.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          No GitHub URLs Found
        </Text>
        <Text></Text>
        <Text>
          This Notion page/database doesn't appear to contain any GitHub repository URLs.
        </Text>
        <Text></Text>
        <Text dimColor>
          Make sure the content includes links like: https://github.com/username/repository
        </Text>
        <Text></Text>
        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select GitHub URL Column
      </Text>
      <Text></Text>
      <Text>
        Found {detectionResult.candidates.length} potential column{detectionResult.candidates.length > 1 ? 's' : ''} with GitHub URLs.
        {detectionResult.topCandidate && ` Best match: ${detectionResult.topCandidate.propertyName}`}
      </Text>
      <Text></Text>

      <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />

      {detectionResult.candidates.map((candidate, index) => {
        const isSelected = selectedIndex === index;

        return (
          <Box key={candidate.propertyName} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {candidate.propertyName}
              </Text>
              <Text dimColor> ({candidate.propertyType})</Text>
              <Text> </Text>
              <ConfidenceBadge confidence={candidate.confidence} showLabel={false} />
            </Box>
            <ListRowDetails>
              Found {candidate.totalUrls} GitHub URL{candidate.totalUrls > 1 ? 's' : ''}
            </ListRowDetails>
            {isSelected && candidate.sampleUrls.length > 0 && (
              <Box marginLeft={4} flexDirection="column">
                <Text dimColor>Sample URLs:</Text>
                {candidate.sampleUrls.map((url, urlIndex) => (
                  <Text key={urlIndex} dimColor>  * {url}</Text>
                ))}
                {candidate.totalUrls > candidate.sampleUrls.length && (
                  <Text dimColor>  ... and {candidate.totalUrls - candidate.sampleUrls.length} more</Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      {previewUrls.length > 0 && (
        <>
          <Text></Text>
          <Text color="cyan" bold>
            Preview - GitHub URLs in selected column:
          </Text>
          {previewUrls.map((url, index) => (
            <Text key={index} dimColor>  * {url}</Text>
          ))}
          {detectionResult.candidates[selectedIndex]?.totalUrls > previewUrls.length && (
            <Text dimColor>
              ... and {detectionResult.candidates[selectedIndex].totalUrls - previewUrls.length} more URLs
            </Text>
          )}
        </>
      )}

      <Text></Text>
      <HelpFooter
        hints={[
          { keys: "Enter", action: "select column" },
          { keys: "'q'", action: "quick start" },
          { keys: "Escape", action: "back", condition: !!onBack },
          { keys: "Ctrl+C", action: "exit" },
        ]}
      />
    </Box>
  );
};