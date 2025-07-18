import React, { useState, useEffect } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import * as path from "path";
import csv from "csv-parser";
import open from "open";
import { TokenStorage } from "./lib/token-storage.js";
import { GitHubService } from "./github/github-service.js";
import { ProviderSelector } from "./components/provider-selector.js";
import { DataSourceSelector, DataSource } from "./components/data-source-selector.js";
import { NotionMCPClient, NotionDatabase } from "./lib/notion/notion-mcp-client.js";
import { NotionService } from "./lib/notion/notion-service.js";
import { NotionPageSelector } from "./components/notion/notion-page-selector.js";
import { NotionContentViewer } from "./components/notion/notion-content-viewer.js";
import {
  AIProvider,
  DEFAULT_PROVIDER,
  AI_PROVIDERS,
} from "./consts/ai-providers.js";
import { PreferencesStorage } from "./lib/preferences-storage.js";

export interface CSVColumn {
  name: string;
  index: number;
  sampleValues: string[];
}

export interface CSVAnalysis {
  filePath: string;
  columns: CSVColumn[];
  totalRows: number;
  suggestedGitHubColumn?: CSVColumn;
}

interface InteractiveCSVProps {
  onComplete: (
    filePath: string,
    columnName: string,
    urls: string[],
    githubToken?: string,
    provider?: AIProvider
  ) => void;
  onError: (error: string) => void;
}

type Step =
  | "github-token"
  | "validating-token"
  | "provider-select"
  | "data-source-select"
  | "notion-auth"
  | "notion-oauth-prompt"
  | "notion-url-input"
  | "notion-fetching"
  | "notion-property-select"
  | "notion-api-page-select"
  | "notion-api-content-view"
  | "input"
  | "analyzing"
  | "select"
  | "loading"
  | "complete";

export const InteractiveCSV: React.FC<InteractiveCSVProps> = ({
  onComplete,
  onError,
}) => {
  const [step, setStep] = useState<Step>("github-token");
  const [csvPath, setCsvPath] = useState("");
  const [input, setInput] = useState("");
  const [githubToken, setGithubToken] = useState<string | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(
    null
  );
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(
    null
  );
  const [notionClient] = useState(new NotionMCPClient());
  const [notionDatabase, setNotionDatabase] = useState<NotionDatabase | null>(null);
  const [notionDatabaseUrl, setNotionDatabaseUrl] = useState("");
  const [notionProperties, setNotionProperties] = useState<string[]>([]);
  const [selectedNotionProperty, setSelectedNotionProperty] = useState<number>(0);
  const [oauthUrl, setOauthUrl] = useState<string>("");
  const [notionApiSelectedPageId, setNotionApiSelectedPageId] = useState<string>("");
  const [notionApiSelectedPageTitle, setNotionApiSelectedPageTitle] = useState<string>("");
  const [notionApiContentType, setNotionApiContentType] = useState<string>("");
  const [analysis, setAnalysis] = useState<CSVAnalysis | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tokenStorage] = useState(new TokenStorage());
  const [preferencesStorage] = useState(new PreferencesStorage());
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [skipGitHub, setSkipGitHub] = useState(false);
  const { exit } = useApp();

  // Initialize and validate token from storage or environment
  useEffect(() => {
    const initializeToken = async () => {
      const savedToken = tokenStorage.getToken();
      const envToken = process.env.GITHUB_TOKEN;
      const token = savedToken || envToken;

      // Load saved provider preference
      try {
        const preferences = await preferencesStorage.loadPreferences();
        if (preferences.selectedProvider) {
          const provider = AI_PROVIDERS.find(
            (p) => p.id === preferences.selectedProvider
          );
          if (provider) {
            setSelectedProvider(provider);
          }
        }
      } catch (error) {
        console.error("Error loading saved provider:", error);
      }

      if (token) {
        setGithubToken(token);
        setValidatingToken(true);
        setStep("validating-token");

        try {
          const githubService = new GitHubService(token);
          const validation = await githubService.validateToken();

          if (validation.valid) {
            setTokenValid(true);
            setStep("provider-select");
          } else {
            setTokenValid(false);
            setStep("github-token");
            console.error("Token validation failed:", validation.error);
          }
        } catch (error) {
          setTokenValid(false);
          setStep("github-token");
          console.error("Token validation error:", error);
        } finally {
          setValidatingToken(false);
        }
      } else {
        setStep("github-token");
      }
    };

    initializeToken();
  }, [tokenStorage, preferencesStorage]);

  // Handle Notion authentication flow
  useEffect(() => {
    if (step === "notion-auth") {
      const handleNotionAuth = async () => {
        try {
          console.log("Starting Notion authentication flow...");
          
          // Discover available tools (this may trigger OAuth)
          const tools = await notionClient.discoverTools();
          console.log("Notion tools discovered:", tools.map(t => t.name));
          
          // Move to URL input step
          setStep("notion-url-input");
        } catch (error) {
          console.error("Notion authentication failed:", error);
          
          // Check if this is OAuth-related
          if (error instanceof Error && (error as any).isOAuthRequired) {
            // Generate OAuth URL and show prompt
            try {
              const authUrl = await notionClient.initiateOAuth();
              setOauthUrl(authUrl);
              setStep("notion-oauth-prompt");
            } catch (oauthError) {
              setError(`Failed to generate OAuth URL: ${oauthError instanceof Error ? oauthError.message : String(oauthError)}`);
              setStep("data-source-select");
            }
          } else {
            setError(`Notion authentication failed: ${error instanceof Error ? error.message : String(error)}`);
            setStep("data-source-select");
          }
        }
      };

      handleNotionAuth();
    }
  }, [step, notionClient]);

  const validateAndAnalyzeCSV = async (
    filePath: string
  ): Promise<CSVAnalysis> => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (path.extname(filePath).toLowerCase() !== ".csv") {
      throw new Error(
        `Invalid file type. Expected .csv file, got: ${path.extname(filePath)}`
      );
    }

    const columns: CSVColumn[] = [];
    const sampleData: Record<string, string[]> = {};
    let totalRows = 0;
    let headerProcessed = false;

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row: Record<string, string>) => {
          if (!headerProcessed) {
            Object.keys(row).forEach((columnName, index) => {
              columns.push({
                name: columnName,
                index,
                sampleValues: [],
              });
              sampleData[columnName] = [];
            });
            headerProcessed = true;
          }

          Object.entries(row).forEach(([columnName, value]) => {
            if (sampleData[columnName].length < 3 && value && value.trim()) {
              sampleData[columnName].push(value.trim());
            }
          });

          totalRows++;
        })
        .on("end", () => {
          columns.forEach((column) => {
            column.sampleValues = sampleData[column.name] || [];
          });

          const suggestedGitHubColumn = columns.find((column) => {
            const nameContainsGitHub = column.name
              .toLowerCase()
              .includes("github");
            const hasGitHubUrls = column.sampleValues.some((value) =>
              value.toLowerCase().includes("github.com")
            );
            return nameContainsGitHub || hasGitHubUrls;
          });

          resolve({
            filePath,
            columns,
            totalRows,
            suggestedGitHubColumn,
          });
        })
        .on("error", (error: any) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  };

  const loadGitHubUrlsFromColumn = async (
    filePath: string,
    columnName: string
  ): Promise<string[]> => {
    const urls: string[] = [];
    const urlSet = new Set<string>();

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row: Record<string, string>) => {
          const value = row[columnName];
          if (value && isValidGitHubURL(value)) {
            const normalizedUrl = value.trim().toLowerCase();
            if (!urlSet.has(normalizedUrl)) {
              urlSet.add(normalizedUrl);
              urls.push(value.trim());
            }
          }
        })
        .on("end", () => {
          resolve(urls);
        })
        .on("error", (error: any) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  };

  const isValidGitHubURL = (url: string): boolean => {
    if (!url || typeof url !== "string") {
      return false;
    }

    const trimmedUrl = url.trim();
    return (
      (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) &&
      trimmedUrl.includes("github.com")
    );
  };

  useInput(async (inputChar, key) => {
    if (step === "github-token") {
      if (key.return) {
        const newToken = input.trim() || githubToken;
        if (newToken) {
          setValidatingToken(true);
          setStep("validating-token");

          // Validate the token
          (async () => {
            try {
              const githubService = new GitHubService(newToken);
              const validation = await githubService.validateToken();

              if (validation.valid) {
                if (newToken !== githubToken) {
                  try {
                    tokenStorage.saveToken(newToken);
                    console.log(
                      "✓ Token saved securely to:",
                      tokenStorage.getConfigDir()
                    );
                  } catch (err) {
                    console.error("Error saving token:", err);
                  }
                }
                setGithubToken(newToken);
                setTokenValid(true);
                setStep("provider-select");
              } else {
                setTokenValid(false);
                setStep("github-token");
                console.error("Token validation failed:", validation.error);
              }
            } catch (error) {
              setTokenValid(false);
              setStep("github-token");
              console.error("Token validation error:", error);
            } finally {
              setValidatingToken(false);
            }
          })();
        } else {
          // Skip GitHub authentication
          setSkipGitHub(true);
          setStep("provider-select");
        }
        setInput("");
      } else if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
      } else if (inputChar === "o" && !input) {
        // Open browser to GitHub token page
        open(
          "https://github.com/settings/tokens/new?description=homework-grader&scopes=public_repo"
        );
        setInput("");
      } else if (inputChar === "c" && !input) {
        // Clear stored token
        tokenStorage.clearToken();
        setGithubToken(undefined);
        setTokenValid(null);
        setInput("");
        console.log("✓ Token cleared from storage");
      } else if (inputChar === "s" && !input) {
        // Skip GitHub authentication
        setSkipGitHub(true);
        setStep("provider-select");
      } else if (
        inputChar &&
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return
      ) {
        setInput((prev) => prev + inputChar);
      }
    } else if (step === "notion-oauth-prompt") {
      if (inputChar === "o") {
        // Open browser to OAuth page
        open(oauthUrl);
      } else if (inputChar === "c") {
        // Copy URL to clipboard - for CLI we'll just show it
        console.log("OAuth URL copied to console:", oauthUrl);
      } else if (inputChar === "r") {
        // Retry authentication after OAuth
        setStep("notion-auth");
      } else if (inputChar === "b") {
        // Go back to data source selection
        setStep("data-source-select");
      }
    } else if (step === "notion-url-input") {
      if (key.return) {
        if (input.trim()) {
          setNotionDatabaseUrl(input.trim());
          setStep("notion-fetching");
          
          // Fetch database info from URL
          (async () => {
            try {
              const database = await notionClient.fetchDatabaseFromUrl(input.trim());
              if (database) {
                setNotionDatabase(database);
                const properties = Object.keys(database.properties);
                setNotionProperties(properties);
                setSelectedNotionProperty(0);
                setStep("notion-property-select");
              } else {
                setError("Could not fetch database from URL");
                setStep("notion-url-input");
              }
            } catch (error) {
              setError(`Failed to fetch database: ${error instanceof Error ? error.message : String(error)}`);
              setStep("notion-url-input");
            }
          })();
        }
        setInput("");
      } else if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
      } else if (
        inputChar &&
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return
      ) {
        setInput((prev) => prev + inputChar);
      }
    } else if (step === "notion-property-select" && notionDatabase) {
      if (key.upArrow) {
        setSelectedNotionProperty((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedNotionProperty((prev) =>
          Math.min(notionProperties.length - 1, prev + 1)
        );
      } else if (key.return) {
        setStep("loading");
        try {
          // Here we would query the database and extract GitHub URLs
          // For now, pass empty array and let the parent handle it
          const selectedProperty = notionProperties[selectedNotionProperty];
          onComplete(
            notionDatabaseUrl,
            selectedProperty,
            [], // We'll implement URL extraction later
            skipGitHub ? undefined : githubToken,
            selectedProvider || DEFAULT_PROVIDER
          );
          setStep("complete");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          onError(err instanceof Error ? err.message : String(err));
          exit();
        }
      }
    } else if (step === "input") {
      if (key.return) {
        if (input.trim()) {
          setCsvPath(input.trim());
          setStep("analyzing");
          try {
            const analysisResult = await validateAndAnalyzeCSV(input.trim());
            setAnalysis(analysisResult);
            setSelectedColumn(
              analysisResult.suggestedGitHubColumn
                ? analysisResult.columns.findIndex(
                    (c) => c.name === analysisResult.suggestedGitHubColumn!.name
                  )
                : 0
            );
            setError(null); // Clear any previous errors
            setStep("select");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setStep("input"); // Return to input step to let user try again
            setInput(""); // Clear the input field
          }
        }
      } else if (key.ctrl && inputChar === "r") {
        // Clear stored token and return to github-token step
        tokenStorage.clearToken();
        setGithubToken(undefined);
        setTokenValid(null);
        setSkipGitHub(false);
        setInput("");
        setStep("github-token");
        console.log("✓ Token cleared from storage - returning to token setup");
      } else if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
      } else if (
        inputChar &&
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return
      ) {
        setInput((prev) => prev + inputChar);
      }
    } else if (step === "select" && analysis) {
      if (key.upArrow) {
        setSelectedColumn((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedColumn((prev) =>
          Math.min(analysis.columns.length - 1, prev + 1)
        );
      } else if (key.return) {
        setStep("loading");
        try {
          const urls = await loadGitHubUrlsFromColumn(
            csvPath,
            analysis.columns[selectedColumn].name
          );
          onComplete(
            csvPath,
            analysis.columns[selectedColumn].name,
            urls,
            skipGitHub ? undefined : githubToken,
            selectedProvider || DEFAULT_PROVIDER
          );
          setStep("complete");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          onError(err instanceof Error ? err.message : String(err));
          exit();
        }
      }
    }

    if (key.ctrl && inputChar === "c") {
      exit();
    }
  });

  if (step === "github-token") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          GitHub Authentication Setup
        </Text>
        <Text></Text>
        <Text>
          To avoid rate limiting (60 requests/hour), please enter your GitHub
          Personal Access Token:
        </Text>
        <Text dimColor>
          • Press 'o' to open GitHub token generation page in browser
        </Text>
        <Text dimColor>• Generate a token with 'public_repo' scope</Text>
        <Text dimColor>• Press 'c' to clear stored token and start fresh</Text>
        <Text dimColor>• Press 's' to skip GitHub authentication</Text>
        <Text dimColor>
          • Or press Enter to continue without authentication
        </Text>
        <Text></Text>
        <Text>
          Current token:{" "}
          {githubToken
            ? `${githubToken.substring(0, 8)}... ${
                tokenValid === true
                  ? "(valid)"
                  : tokenValid === false
                  ? "(invalid)"
                  : "(saved)"
              }`
            : "None"}
        </Text>
        <Text dimColor>Stored in: {tokenStorage.getConfigDir()}</Text>
        <Text></Text>
        <Text>Enter GitHub token (or press Enter to skip):</Text>
        <Box>
          <Text color="green">{"> "}</Text>
          <Text>{input.replace(/./g, "*")}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text dimColor>
          Commands: 'o' = open GitHub | 'c' = clear token | 's' = skip | Enter =
          continue | Ctrl+C = exit
        </Text>
      </Box>
    );
  }

  if (step === "validating-token") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Validating GitHub token...</Text>
        <Text>Please wait while we verify your token...</Text>
      </Box>
    );
  }

  if (step === "provider-select") {
    return (
      <ProviderSelector
        onSelect={(provider) => {
          setSelectedProvider(provider);
          setStep("data-source-select");
        }}
      />
    );
  }

  if (step === "data-source-select") {
    return (
      <Box flexDirection="column">
        {error && (
          <>
            <Text color="red">Error: {error}</Text>
            <Text></Text>
          </>
        )}
        <DataSourceSelector
          onSelect={(source) => {
            setError(null); // Clear any previous errors
            setSelectedDataSource(source);
            if (source === "csv") {
              setStep("input");
            } else if (source === "notion") {
              // Use the new Notion API integration instead of MCP
              setStep("notion-api-page-select");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "notion-auth") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Notion Authentication
        </Text>
        <Text></Text>
        <Text>Connecting to Notion MCP server...</Text>
        <Text dimColor>This will discover available tools and may trigger OAuth authentication.</Text>
        <Text></Text>
        <Text color="yellow">Please wait while we connect to Notion...</Text>
      </Box>
    );
  }

  if (step === "notion-oauth-prompt") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Notion OAuth Authentication Required
        </Text>
        <Text></Text>
        <Text>To access your Notion workspace, you need to authorize this application.</Text>
        <Text></Text>
        <Text color="green">Press 'o' to open the authorization page in your browser</Text>
        <Text color="green">Press 'c' to copy the authorization URL to clipboard</Text>
        <Text color="green">Press 'r' to retry after authorization</Text>
        <Text color="red">Press 'b' to go back to data source selection</Text>
        <Text></Text>
        <Text dimColor>Authorization URL:</Text>
        <Text dimColor wrap="wrap">{oauthUrl}</Text>
        <Text></Text>
        <Text dimColor>
          Commands: 'o' = open browser | 'c' = copy URL | 'r' = retry | 'b' = back | Ctrl+C = exit
        </Text>
      </Box>
    );
  }

  if (step === "notion-url-input") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Notion Database URL
        </Text>
        <Text></Text>
        <Text>Please paste the URL of your Notion database:</Text>
        <Text dimColor>Example: https://www.notion.so/your-workspace/database-name-123abc</Text>
        <Text></Text>
        {error && (
          <>
            <Text color="red">Error: {error}</Text>
            <Text></Text>
          </>
        )}
        <Text>Enter Notion database URL:</Text>
        <Box>
          <Text color="green">{"> "}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text dimColor>Press Enter to continue, Ctrl+C to exit</Text>
      </Box>
    );
  }

  if (step === "notion-fetching") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Fetching Notion database...</Text>
        <Text>URL: {notionDatabaseUrl}</Text>
        <Text dimColor>Please wait while we retrieve database information...</Text>
      </Box>
    );
  }

  if (step === "notion-property-select" && notionDatabase) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Notion Database Properties
        </Text>
        <Text>Database: {notionDatabase.title}</Text>
        <Text></Text>
        <Text color="green" bold>
          Select property containing GitHub URLs:
        </Text>
        <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
        <Text></Text>

        {notionProperties.map((property, index) => {
          const isSelected = index === selectedNotionProperty;
          return (
            <Box key={index}>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {index + 1}. {property}
              </Text>
            </Box>
          );
        })}
      </Box>
    );
  }

  if (step === "input") {
    const authStatus = skipGitHub
      ? "Skipped (60 requests/hour limit)"
      : githubToken
      ? "✓ Token configured"
      : "⚠ No token (60 requests/hour limit)";
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          CSV GitHub URL Extractor
        </Text>
        <Text>Authentication: {authStatus}</Text>
        <Text>Model: {selectedProvider?.name || "Not selected"}</Text>
        <Text>Data Source: {selectedDataSource === "csv" ? "CSV File" : "Unknown"}</Text>
        <Text></Text>
        {error && (
          <>
            <Text color="red">Error: {error}</Text>
            <Text></Text>
          </>
        )}
        <Text>Enter the path to your CSV file:</Text>
        <Box>
          <Text color="green">{"> "}</Text>
          <Text>{input}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text dimColor>
          Press Enter to continue, Ctrl+R to clear token, Ctrl+C to exit
        </Text>
      </Box>
    );
  }

  if (step === "analyzing") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Analyzing CSV file...</Text>
        <Text>Reading: {csvPath}</Text>
      </Box>
    );
  }

  if (step === "select" && analysis) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          CSV Analysis Complete
        </Text>
        <Text>File: {analysis.filePath}</Text>
        <Text>Total rows: {analysis.totalRows}</Text>
        <Text></Text>
        <Text color="green" bold>
          Select GitHub URL column:
        </Text>
        <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
        <Text></Text>

        {analysis.columns.map((column, index) => {
          const isSelected = index === selectedColumn;
          const isSuggested =
            analysis.suggestedGitHubColumn?.name === column.name;

          return (
            <Box key={index} flexDirection="column">
              <Box>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                  {isSelected ? "→ " : "  "}
                  {index + 1}. {column.name}
                  {isSuggested ? " (suggested)" : ""}
                </Text>
              </Box>
              {column.sampleValues.length > 0 && (
                <Box marginLeft={4}>
                  <Text dimColor>Sample: {column.sampleValues.join(", ")}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  if (step === "loading") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Loading GitHub URLs...</Text>
        <Text>Processing column: {analysis?.columns[selectedColumn].name}</Text>
      </Box>
    );
  }

  if (step === "complete") {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Complete!
        </Text>
        <Text>GitHub URLs loaded successfully</Text>
      </Box>
    );
  }

  if (step === "notion-api-page-select") {
    return (
      <Box flexDirection="column">
        <NotionPageSelector
          onSelect={(pageId, pageTitle) => {
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setStep("notion-api-content-view");
          }}
          onError={(error) => {
            setError(error);
            setStep("data-source-select");
          }}
        />
      </Box>
    );
  }

  if (step === "notion-api-content-view") {
    return (
      <Box flexDirection="column">
        <NotionContentViewer
          pageId={notionApiSelectedPageId}
          pageTitle={notionApiSelectedPageTitle}
          contentType={notionApiContentType}
          onComplete={() => {
            setStep("complete");
          }}
          onNavigate={(pageId, pageTitle, contentType) => {
            // Navigate to a new page/database
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(contentType || "");
            // Stay in the same step to show the new content
          }}
        />
      </Box>
    );
  }

  return null;
};
