import React, { useState, useEffect, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter, createHelpHints, ConfidenceBadge } from "../ui/index.js";
import { GitHubUrlParser } from "../../lib/github/github-url-parser.js";

interface UsernameCandidate {
  propertyName: string;
  propertyType: string;
  confidence: number;
  sampleUsernames: string[];
  totalUsernames: number;
  extractionMethod: "direct" | "from_url";
}

interface CollaboratorNotionColumnSelectorProps {
  notionContent: {
    type?: string;
    database?: {
      properties?: Record<string, { type: string }>;
    };
    entries?: Array<{
      id: string;
      properties?: Record<string, any>;
    }>;
  };
  onSelect: (usernames: string[]) => void;
  onBack: () => void;
  targetRepo: string;
}

const GITHUB_USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

const PROPERTY_NAME_KEYWORDS = [
  "github",
  "username",
  "user",
  "owner",
  "author",
  "contributor",
  "member",
  "student",
  "name",
];

function extractUsername(value: string): string | null {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Try to parse as GitHub URL first
  const parsed = GitHubUrlParser.parse(trimmed);
  if (parsed) {
    return parsed.owner; // Extract username from URL
  }

  // Otherwise treat as direct username if valid format
  if (GITHUB_USERNAME_REGEX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function extractPropertyValue(propertyValue: any, propertyType: string): string {
  if (!propertyValue) return "";

  switch (propertyType) {
    case "url":
      return propertyValue.url || "";
    case "rich_text":
      return (propertyValue.rich_text || [])
        .map((rt: any) => rt.plain_text || rt.text?.content || "")
        .join("");
    case "title":
      return (propertyValue.title || [])
        .map((rt: any) => rt.plain_text || rt.text?.content || "")
        .join("");
    case "email":
      return propertyValue.email || "";
    default:
      if (typeof propertyValue === "string") {
        return propertyValue;
      } else if (propertyValue.plain_text) {
        return propertyValue.plain_text;
      }
      return "";
  }
}

function calculateConfidence(
  propertyName: string,
  propertyType: string,
  usernameCount: number,
  extractionMethod: "direct" | "from_url"
): number {
  if (usernameCount === 0) return 0;

  let confidence = Math.min(usernameCount * 15, 40); // Base score from count

  // Boost for property name keywords
  const lowerName = propertyName.toLowerCase();
  for (const keyword of PROPERTY_NAME_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      confidence += 35;
      break;
    }
  }

  // Boost for URL-type properties (likely GitHub URLs)
  if (propertyType === "url") {
    confidence += 20;
  } else if (propertyType === "rich_text" || propertyType === "title") {
    confidence += 10;
  }

  // Slight preference for direct usernames over URL extraction
  if (extractionMethod === "direct") {
    confidence += 5;
  }

  return Math.min(confidence, 100);
}

export const CollaboratorNotionColumnSelector: React.FC<CollaboratorNotionColumnSelectorProps> = ({
  notionContent,
  onSelect,
  onBack,
  targetRepo,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [candidates, setCandidates] = useState<UsernameCandidate[]>([]);
  const [previewUsernames, setPreviewUsernames] = useState<string[]>([]);

  // Analyze the Notion content for username columns
  useEffect(() => {
    const analyzeContent = () => {
      setIsLoading(true);

      if (notionContent?.type !== "database" || !notionContent.database?.properties) {
        setIsLoading(false);
        return;
      }

      const results: UsernameCandidate[] = [];
      const entries = notionContent.entries || [];

      for (const [propertyName, propertyDef] of Object.entries(notionContent.database.properties)) {
        const propertyType = (propertyDef as any).type || "";

        // Only check text-like properties
        if (!["url", "rich_text", "title", "email", "phone_number"].includes(propertyType)) {
          continue;
        }

        const extractedUsernames = new Set<string>();
        let extractionMethod: "direct" | "from_url" = "direct";
        let urlExtractionCount = 0;
        let directExtractionCount = 0;

        for (const entry of entries) {
          const propertyValue = entry.properties?.[propertyName];
          if (!propertyValue) continue;

          const valueText = extractPropertyValue(propertyValue, propertyType);
          if (!valueText) continue;

          const username = extractUsername(valueText);
          if (username) {
            extractedUsernames.add(username);

            // Track extraction method
            if (GitHubUrlParser.parse(valueText.trim())) {
              urlExtractionCount++;
            } else {
              directExtractionCount++;
            }
          }
        }

        if (extractedUsernames.size > 0) {
          extractionMethod = urlExtractionCount > directExtractionCount ? "from_url" : "direct";

          const usernamesArray = Array.from(extractedUsernames);
          const confidence = calculateConfidence(
            propertyName,
            propertyType,
            usernamesArray.length,
            extractionMethod
          );

          results.push({
            propertyName,
            propertyType,
            confidence,
            sampleUsernames: usernamesArray.slice(0, 3),
            totalUsernames: usernamesArray.length,
            extractionMethod,
          });
        }
      }

      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence);
      setCandidates(results);

      // Set preview for top candidate
      if (results.length > 0) {
        setPreviewUsernames(results[0].sampleUsernames);
      }

      setIsLoading(false);
    };

    analyzeContent();
  }, [notionContent]);

  // Update preview when selection changes
  useEffect(() => {
    if (candidates[selectedIndex]) {
      setPreviewUsernames(candidates[selectedIndex].sampleUsernames);
    }
  }, [selectedIndex, candidates]);

  const extractAllUsernames = (propertyName: string): string[] => {
    if (notionContent?.type !== "database") return [];

    const propertyDef = notionContent.database?.properties?.[propertyName];
    if (!propertyDef) return [];

    const propertyType = (propertyDef as any).type || "";
    const entries = notionContent.entries || [];
    const usernames = new Set<string>();

    for (const entry of entries) {
      const propertyValue = entry.properties?.[propertyName];
      if (!propertyValue) continue;

      const valueText = extractPropertyValue(propertyValue, propertyType);
      if (!valueText) continue;

      const username = extractUsername(valueText);
      if (username) {
        usernames.add(username);
      }
    }

    return Array.from(usernames);
  };

  useInput((input, key) => {
    if (isLoading) return;

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(candidates.length - 1, prev + 1));
    } else if (key.return && candidates.length > 0) {
      const selectedCandidate = candidates[selectedIndex];
      const usernames = extractAllUsernames(selectedCandidate.propertyName);
      if (usernames.length > 0) {
        onSelect(usernames);
      }
    } else if (input === "q" && candidates.length > 0) {
      // Quick start with top candidate
      const usernames = extractAllUsernames(candidates[0].propertyName);
      if (usernames.length > 0) {
        onSelect(usernames);
      }
    } else if (key.escape) {
      onBack();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Analyzing Database for GitHub Usernames...
        </Text>
        <Text></Text>
        <Text>Scanning columns for usernames and GitHub URLs...</Text>
      </Box>
    );
  }

  if (candidates.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          No Username Columns Found
        </Text>
        <Text></Text>
        <Text>
          Could not find any columns containing GitHub usernames or GitHub URLs.
        </Text>
        <Text></Text>
        <Text dimColor>
          Make sure your database has a column with GitHub usernames (e.g., "octocat")
        </Text>
        <Text dimColor>
          or GitHub profile/repo URLs (e.g., "https://github.com/octocat/repo")
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Username Column
      </Text>
      <Text dimColor>Adding collaborators to: {targetRepo}</Text>
      <Text></Text>
      <Text>
        Found {candidates.length} column{candidates.length > 1 ? "s" : ""} with potential GitHub usernames.
      </Text>
      <Text></Text>

      {candidates.map((candidate, index) => {
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
              {candidate.extractionMethod === "from_url" && (
                <Text color="cyan"> [from URLs]</Text>
              )}
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>
                {candidate.totalUsernames} username{candidate.totalUsernames > 1 ? "s" : ""} found
              </Text>
            </Box>
            {isSelected && candidate.sampleUsernames.length > 0 && (
              <Box marginLeft={4} flexDirection="column">
                <Text dimColor>Sample usernames:</Text>
                {candidate.sampleUsernames.map((username, i) => (
                  <Text key={i} dimColor>
                    {"  "}* {username}
                  </Text>
                ))}
                {candidate.totalUsernames > candidate.sampleUsernames.length && (
                  <Text dimColor>
                    {"  "}... and {candidate.totalUsernames - candidate.sampleUsernames.length} more
                  </Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      <Text></Text>
      <HelpFooter
        hints={createHelpHints(
          "navigate",
          "select",
          { keys: "'q'", action: "quick start" },
          "back"
        )}
      />
    </Box>
  );
};
