import React, { useState, useEffect } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import * as path from "path";
import csv from "csv-parser";
import open from "open";
import { TokenStorage } from "./lib/token-storage.js";
import { E2BTokenStorage } from "./lib/e2b-token-storage.js";
import { GitHubService } from "./github/github-service.js";
import { GitHubUrlDetector } from "./lib/github-url-detector.js";
import { saveRepositoryFiles } from "./lib/file-saver.js";
import { ProviderSelector } from "./components/provider-selector.js";
import {
  DataSourceSelector,
  DataSource,
} from "./components/data-source-selector.js";
import {
  NotionMCPClient,
  NotionDatabase,
} from "./lib/notion/notion-mcp-client.js";
import { NotionService } from "./lib/notion/notion-service.js";
import { NotionOAuthClient } from "./lib/notion/oauth-client.js";
import { NotionTokenStorage } from "./lib/notion/notion-token-storage.js";
import { NotionPageSelector } from "./components/notion/notion-page-selector.js";
import { NotionContentViewer } from "./components/notion/notion-content-viewer.js";
import { GitHubColumnSelector } from "./components/notion/github-column-selector.js";
import { BackButton } from "./components/ui/back-button.js";
import { NotionOAuthInfo } from "./components/notion/oauth-info.js";
import {
  AIProvider,
  DEFAULT_PROVIDER,
  AI_PROVIDERS,
} from "./consts/ai-providers.js";
import { PreferencesStorage } from "./lib/preferences-storage.js";
import {
  GradingSaveOptions,
  SaveOption,
} from "./components/grading-save-options.js";
import { GradingResult } from "./lib/file-saver.js";
import { GradingDatabaseService } from "./lib/notion/grading-database-service.js";

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
    e2bApiKey?: string,
    provider?: AIProvider
  ) => void;
  onError: (error: string) => void;
}

type Step =
  | "github-token"
  | "validating-token"
  | "e2b-api-key"
  | "validating-e2b-key"
  | "provider-select"
  | "data-source-select"
  | "notion-auth"
  | "notion-auth-loading"
  | "notion-oauth-prompt"
  | "notion-url-input"
  | "notion-fetching"
  | "notion-property-select"
  | "notion-api-page-select"
  | "notion-api-content-view"
  | "notion-oauth-info"
  | "notion-github-column-select"
  | "notion-processing"
  | "grading-save-options"
  | "notion-saving"
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
  const [e2bApiKey, setE2bApiKey] = useState<string | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(
    null
  );
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [notionClient] = useState(new NotionMCPClient());
  const [notionOAuthClient] = useState(new NotionOAuthClient());
  const [notionDatabase, setNotionDatabase] = useState<NotionDatabase | null>(
    null
  );
  const [notionDatabaseUrl, setNotionDatabaseUrl] = useState("");
  const [notionProperties, setNotionProperties] = useState<string[]>([]);
  const [selectedNotionProperty, setSelectedNotionProperty] =
    useState<number>(0);
  const [oauthUrl, setOauthUrl] = useState<string>("");
  const [notionApiSelectedPageId, setNotionApiSelectedPageId] =
    useState<string>("");
  const [notionApiSelectedPageTitle, setNotionApiSelectedPageTitle] =
    useState<string>("");
  const [notionApiContentType, setNotionApiContentType] = useState<string>("");
  const [notionApiContent, setNotionApiContent] = useState<any>(null);
  const [notionSelectedProperty, setNotionSelectedProperty] =
    useState<any>(null);
  const [notionGitHubUrls, setNotionGitHubUrls] = useState<
    Array<{ url: string; pageId: string }>
  >([]);
  const [selectedGitHubColumn, setSelectedGitHubColumn] = useState<string>("");
  // Cache Notion data to avoid refetching on back navigation
  const [cachedNotionPages, setCachedNotionPages] = useState<any[]>([]);
  const [cachedNotionDatabases, setCachedNotionDatabases] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<CSVAnalysis | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [tokenStorage] = useState(new TokenStorage());
  const [e2bTokenStorage] = useState(new E2BTokenStorage());
  const [preferencesStorage] = useState(new PreferencesStorage());
  const [processingResults, setProcessingResults] = useState<{
    processed: number;
    total: number;
    currentUrl?: string;
    results: Array<{ url: string; success: boolean; error?: string }>;
  }>({ processed: 0, total: 0, results: [] });
  const [gradingResults, setGradingResults] = useState<GradingResult[]>([]);
  const [originalDatabaseId, setOriginalDatabaseId] = useState<
    string | undefined
  >();
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [validatingE2BKey, setValidatingE2BKey] = useState(false);
  const [e2bKeyValid, setE2BKeyValid] = useState<boolean | null>(null);
  const [skipGitHub, setSkipGitHub] = useState(false);
  const [loadingIconIndex, setLoadingIconIndex] = useState(0);
  const { exit } = useApp();

  // Loading animation for Notion auth
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (step === "notion-auth-loading") {
      interval = setInterval(() => {
        setLoadingIconIndex((prev) => (prev + 1) % 6);
      }, 300);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [step]);

  // Process GitHub URLs when entering notion-processing step
  useEffect(() => {
    if (step === "notion-processing" && notionGitHubUrls.length > 0) {
      const processGitHubUrls = async () => {
        setProcessingResults({
          processed: 0,
          total: notionGitHubUrls.length,
          results: [],
        });

        // Get max depth from preferences or environment variable, default to 5
        const preferences = await preferencesStorage.loadPreferences();
        const maxDepth =
          preferences.githubConfig?.maxDepth ||
          parseInt(process.env.GITHUB_MAX_DEPTH || "5", 10);

        const results: Array<{
          url: string;
          success: boolean;
          error?: string;
        }> = [];
        const collectedGradingResults: GradingResult[] = [];

        // Set original database ID if we came from Notion
        if (notionApiSelectedPageId) {
          setOriginalDatabaseId(notionApiSelectedPageId);
        }

        // Determine which processing method to use (default to Vercel Sandbox)
        const useGitHubAPI = process.env.GITHUB_API_ONLY === "true";

        // Initialize services once for efficiency
        let githubService: GitHubService | null = null;
        let sandboxService: any = null;

        if (useGitHubAPI) {
          githubService = new GitHubService(githubToken, undefined, maxDepth);
        } else {
          try {
            const { SandboxService } = await import(
              "./lib/sandbox/index.js"
            );
            sandboxService = new SandboxService();
            await sandboxService.initialize();
            console.log(
              `🚀 Using Vercel Sandbox for processing ${notionGitHubUrls.length} repositories`
            );
          } catch (sandboxError) {
            console.warn(
              `Failed to initialize Vercel Sandbox, falling back to GitHub API:`,
              sandboxError
            );
            githubService = new GitHubService(githubToken, undefined, maxDepth);
          }
        }

        try {
          for (let i = 0; i < notionGitHubUrls.length; i++) {
            const urlItem = notionGitHubUrls[i];
            const url = urlItem.url;
            const pageId = urlItem.pageId || undefined; // Convert empty string to undefined

            setProcessingResults((prev) => ({
              ...prev,
              processed: i,
              currentUrl: url,
            }));

            try {
              console.log(
                `Processing repository ${i + 1}/${
                  notionGitHubUrls.length
                }: ${url}`
              );

              // Use the appropriate service
              let result: any;
              let repoInfo: any;

              if (sandboxService) {
                // Use Vercel Sandbox
                repoInfo = sandboxService.parseGitHubUrl(url);
                if (repoInfo) {
                  result = await sandboxService.processGitHubUrl(
                    url,
                    selectedProvider || DEFAULT_PROVIDER
                  );
                }
              } else if (githubService) {
                // Use GitHub API (either by choice or fallback)
                repoInfo = githubService.parseGitHubUrl(url);
                if (repoInfo) {
                  result = await githubService.processGitHubUrl(
                    url,
                    selectedProvider || DEFAULT_PROVIDER
                  );
                }
              }

              if (repoInfo && result) {
                const gradingResult = await saveRepositoryFiles(
                  repoInfo,
                  result,
                  url,
                  selectedProvider || DEFAULT_PROVIDER,
                  pageId
                );

                if (gradingResult) {
                  collectedGradingResults.push(gradingResult);
                }
              }

              results.push({ url, success: true });
              console.log(`✓ Successfully processed ${url}`);
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              results.push({ url, success: false, error: errorMessage });
              console.error(`✗ Failed to process ${url}:`, errorMessage);
            }

            // Update progress
            setProcessingResults((prev) => ({
              ...prev,
              processed: i + 1,
              results: [...results],
            }));

            // Add small delay between requests to avoid overwhelming APIs
            if (i < notionGitHubUrls.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }

          // Processing complete
          console.log(
            `\n✓ Processing complete! Processed ${results.length} repositories.`
          );
          console.log(
            `✓ Successful: ${results.filter((r) => r.success).length}`
          );
          console.log(`✗ Failed: ${results.filter((r) => !r.success).length}`);

          // Save grading results and move to save options
          setGradingResults(collectedGradingResults);

          // Show save options after a short delay
          setTimeout(() => {
            setStep("grading-save-options");
          }, 2000);
        } finally {
          // Cleanup sandbox if it was used
          if (sandboxService) {
            console.log(`🧹 Cleaning up Vercel Sandbox...`);
            await sandboxService.cleanup();
          }
        }
      };

      processGitHubUrls().catch((error) => {
        console.error("Failed to process GitHub URLs:", error);
        setError(
          `Failed to process repositories: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStep("notion-github-column-select");
      });
    }
  }, [step, notionGitHubUrls, githubToken, selectedProvider]);

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
          // For token validation, we don't need depth limit configuration
          const githubService = new GitHubService(token);
          const validation = await githubService.validateToken();

          if (validation.valid) {
            setTokenValid(true);
            setStep("e2b-api-key");
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

  // Handle E2B API key initialization
  useEffect(() => {
    const initializeE2BKey = async () => {
      if (step !== "e2b-api-key") return;
      
      const savedKey = e2bTokenStorage.getToken();
      const envKey = process.env.E2B_API_KEY;
      const key = savedKey || envKey;

      if (key) {
        setE2bApiKey(key);
        setValidatingE2BKey(true);
        setStep("validating-e2b-key");

        try {
          // Validate E2B API key format
          if (e2bTokenStorage.validateKeyFormat(key)) {
            setE2BKeyValid(true);
            setStep("provider-select");
          } else {
            setE2BKeyValid(false);
            setStep("e2b-api-key");
            console.error("E2B API key format is invalid");
          }
        } catch (error) {
          setE2BKeyValid(false);
          setStep("e2b-api-key");
          console.error("E2B API key validation error:", error);
        } finally {
          setValidatingE2BKey(false);
        }
      }
    };

    initializeE2BKey();
  }, [step, e2bTokenStorage]);

  // Handle Notion authentication loading transition
  useEffect(() => {
    if (step === "notion-auth-loading") {
      const timer = setTimeout(async () => {
        // Check if user already has authentication
        const storage = new NotionTokenStorage();
        const hasExistingAuth = storage.hasToken();
        
        if (hasExistingAuth) {
          // Try to use existing auth directly
          try {
            await notionOAuthClient.refreshIfPossible();
            await notionOAuthClient.ensureAuthenticated();
            setStep("notion-api-page-select");
          } catch (e: any) {
            // Auth failed, show OAuth info page
            setStep("notion-oauth-info");
          }
        } else {
          // No existing auth, show OAuth info page
          setStep("notion-oauth-info");
        }
      }, 1500); // Show loading animation for 1.5 seconds
      
      return () => clearTimeout(timer);
    }
  }, [step, notionOAuthClient]);

  // Handle Notion authentication flow
  useEffect(() => {
    if (step === "notion-auth") {
      const handleNotionAuth = async () => {
        try {
          console.log("Starting Notion authentication flow...");

          // Discover available tools (this may trigger OAuth)
          const tools = await notionClient.discoverTools();
          console.log(
            "Notion tools discovered:",
            tools.map((t) => t.name)
          );

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
              setError(
                `Failed to generate OAuth URL: ${
                  oauthError instanceof Error
                    ? oauthError.message
                    : String(oauthError)
                }`
              );
              setStep("data-source-select");
            }
          } else {
            setError(
              `Notion authentication failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
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
              // For token validation, we don't need depth limit configuration
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
                setStep("e2b-api-key");
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
          setStep("e2b-api-key");
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
        setStep("e2b-api-key");
      } else if (
        inputChar &&
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return
      ) {
        setInput((prev) => prev + inputChar);
      }
    } else if (step === "e2b-api-key") {
      if (key.return) {
        const newKey = input.trim() || e2bApiKey;
        if (newKey) {
          setValidatingE2BKey(true);
          setStep("validating-e2b-key");

          // Validate the E2B API key
          (async () => {
            try {
              if (e2bTokenStorage.validateKeyFormat(newKey)) {
                if (newKey !== e2bApiKey) {
                  try {
                    e2bTokenStorage.saveToken(newKey);
                    console.log(
                      "✓ E2B API key saved securely to:",
                      e2bTokenStorage.getConfigDir()
                    );
                  } catch (err) {
                    console.error("Error saving E2B API key:", err);
                  }
                }
                setE2bApiKey(newKey);
                setE2BKeyValid(true);
                setStep("provider-select");
              } else {
                setE2BKeyValid(false);
                setStep("e2b-api-key");
                console.error("E2B API key format is invalid");
              }
            } catch (error) {
              setE2BKeyValid(false);
              setStep("e2b-api-key");
              console.error("E2B API key validation error:", error);
            } finally {
              setValidatingE2BKey(false);
            }
          })();
        } else {
          // Skip E2B, proceed to provider selection
          setStep("provider-select");
        }
        setInput("");
      } else if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
      } else if (inputChar === "o" && !input) {
        // Open browser to E2B dashboard
        open("https://e2b.dev/");
        setInput("");
      } else if (inputChar === "c" && !input) {
        // Clear stored E2B API key
        e2bTokenStorage.clearToken();
        setE2bApiKey(undefined);
        setE2BKeyValid(null);
        setInput("");
        console.log("✓ E2B API key cleared from storage");
      } else if (inputChar === "s" && !input) {
        // Skip E2B API key
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
        // Retry authentication after OAuth with loading animation
        setStep("notion-auth-loading");
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
              const database = await notionClient.fetchDatabaseFromUrl(
                input.trim()
              );
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
              setError(
                `Failed to fetch database: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
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
            e2bApiKey,
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
            e2bApiKey,
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

  // Handle save option selection
  const handleSaveOptionSelected = async (
    option: SaveOption,
    databaseId?: string
  ) => {
    try {
      if (option === "file" || option === "skip") {
        // Files are already saved, just complete
        setStep("complete");
      } else if (option === "original-database" || option === "new-database") {
        if (!databaseId) {
          setError("Database ID is required for Notion saving");
          return;
        }

        setStep("notion-saving");

        // Save to Notion database
        const service = new GradingDatabaseService();

        // Ensure database has grading schema, but skip github_url column if we already have one
        await service.ensureGradingDatabase(databaseId, {
          skipGithubUrlColumn: selectedGitHubColumn,
        });

        // Save all grading results
        const result = await service.saveGradingResults(
          databaseId,
          gradingResults,
          selectedGitHubColumn
        );

        if (result.failed > 0) {
          setError(
            `Saved ${result.success} entries, failed ${
              result.failed
            }. Errors: ${result.errors.join(", ")}`
          );
        } else {
          console.log(
            `✓ Successfully saved ${result.success} grading results to Notion database`
          );
        }

        setStep("complete");
      }
    } catch (error: any) {
      setError(`Failed to save to Notion: ${error.message}`);
      setStep("grading-save-options");
    }
  };

  // All conditional rendering in a single return statement
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

  if (step === "e2b-api-key") {
    return (
      <Box flexDirection="column">
        <Text bold color="blue">
          E2B API Key Setup
        </Text>
        <Text>
          To process repositories efficiently, please enter your E2B API key:
        </Text>
        <Text color="gray">
          • Press 'o' to open E2B dashboard to get your API key
        </Text>
        <Text color="gray">
          • Press 'c' to clear stored API key and start fresh
        </Text>
        <Text color="gray">
          • Press 's' to skip E2B (will use GitHub API instead)
        </Text>
        <Text color="gray">• Or press Enter to continue</Text>

        <Box marginTop={1}>
          <Text color="gray">Current key: </Text>
          <Text color={e2bApiKey ? "green" : "red"}>
            {e2bApiKey ? "****************************" + e2bApiKey.slice(-4) : "None"}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Stored in: </Text>
          <Text color="gray">{e2bTokenStorage.getConfigDir()}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="cyan">Enter E2B API key (or press Enter to skip):</Text>
          <Text color="white">
            &gt; {input.replace(/./g, "*")}█
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">
            Commands: 'o' = open E2B dashboard | 'c' = clear key | 's' = skip | Enter = continue | Ctrl+C = exit
          </Text>
        </Box>

        {e2bKeyValid === false && (
          <Box marginTop={1}>
            <Text color="red">
              ✗ Invalid E2B API key format. Please check your key and try again.
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "validating-e2b-key") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Validating E2B API key...</Text>
        <Text>Please wait while we verify your API key format...</Text>
      </Box>
    );
  }

  if (step === "notion-auth-loading") {
    const loadingIcons = ["🔄", "⚡", "🚀", "✨", "🔮", "💫"];
    const loadingMessages = [
      "Connecting to Notion...",
      "Authenticating your access...",
      "Preparing your workspace...",
      "Establishing secure connection...",
      "Verifying permissions...",
      "Almost ready..."
    ];
    
    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold color="blue">
          Notion Authentication
        </Text>
        <Box marginTop={1} alignItems="center">
          <Text>
            {loadingIcons[loadingIconIndex]}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="cyan">
            {loadingMessages[loadingIconIndex]}
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color="gray">
            This may take a moment while we connect to your Notion workspace...
          </Text>
        </Box>
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

            // Clear caches when switching data sources
            setCachedNotionPages([]);
            setCachedNotionDatabases([]);

            if (source === "csv") {
              setStep("input");
            } else if (source === "notion") {
              setStep("notion-auth-loading");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "notion-oauth-info") {
    return (
      <NotionOAuthInfo
        onContinue={() => {
          setStep("loading");
          (async () => {
            try {
              await notionOAuthClient.refreshIfPossible();
              await notionOAuthClient.ensureAuthenticated();
              setStep("notion-api-page-select");
            } catch (e: any) {
              setError(
                `Notion authentication failed: ${
                  e instanceof Error ? e.message : String(e)
                }`
              );
              setStep("data-source-select");
            }
          })();
        }}
        onBack={() => setStep("data-source-select")}
        onClear={() => {
          const storage = new NotionTokenStorage();
          storage.clearToken();
        }}
        hasAccess={(() => {
          const storage = new NotionTokenStorage();
          return storage.hasToken();
        })()}
      />
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
        <Text dimColor>
          This will discover available tools and may trigger OAuth
          authentication.
        </Text>
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
        <Text>
          To access your Notion workspace, you need to authorize this
          application.
        </Text>
        <Text></Text>
        <Text color="green">
          Press 'o' to open the authorization page in your browser
        </Text>
        <Text color="green">
          Press 'c' to copy the authorization URL to clipboard
        </Text>
        <Text color="green">Press 'r' to retry after authorization</Text>
        <Text color="red">Press 'b' to go back to data source selection</Text>
        <Text></Text>
        <Text dimColor>Authorization URL:</Text>
        <Text dimColor wrap="wrap">
          {oauthUrl}
        </Text>
        <Text></Text>
        <Text dimColor>
          Commands: 'o' = open browser | 'c' = copy URL | 'r' = retry | 'b' =
          back | Ctrl+C = exit
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
        <Text dimColor>
          Example: https://www.notion.so/your-workspace/database-name-123abc
        </Text>
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
        <Text dimColor>
          Please wait while we retrieve database information...
        </Text>
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
        <Text>
          Data Source: {selectedDataSource === "csv" ? "CSV File" : "Unknown"}
        </Text>
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
        {notionGitHubUrls.length > 0 ? (
          <>
            <Text>
              Processed {processingResults.results.length} GitHub repositories
              from Notion
            </Text>
            <Text color="green">
              ✓ Successful:{" "}
              {processingResults.results.filter((r) => r.success).length}
            </Text>
            <Text color="red">
              ✗ Failed:{" "}
              {processingResults.results.filter((r) => !r.success).length}
            </Text>
            <Text></Text>
            <Text dimColor>Results saved to /test-results/ directory</Text>
          </>
        ) : (
          <Text>GitHub URLs loaded successfully</Text>
        )}
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
          onStartGrading={async (pageId, pageTitle) => {
            // Start grading directly without viewing content first
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);

            // Fetch the content directly and proceed to column selection
            try {
              const token = await notionOAuthClient.ensureAuthenticated();
              const notionService = new NotionService(token.access_token);
              const content = await notionService.getPageContent(pageId);
              setNotionApiContent(content);
              setStep("notion-github-column-select");
            } catch (error) {
              setError(
                `Failed to fetch content for grading: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }}
          onError={(error) => {
            setError(error);
            setStep("data-source-select");
          }}
          onBack={() => setStep("data-source-select")}
          // Pass cached data to avoid refetching
          cachedPages={cachedNotionPages}
          cachedDatabases={cachedNotionDatabases}
          // Cache data when first loaded
          onDataLoaded={(pages, databases) => {
            setCachedNotionPages(pages);
            setCachedNotionDatabases(databases);
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
          onComplete={(content) => {
            setNotionApiContent(content);
            setStep("notion-github-column-select");
          }}
          onNavigate={(pageId, pageTitle, contentType) => {
            // Navigate to a new page/database
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(contentType || "");
            // Stay in the same step to show the new content
          }}
          onStartGrading={async (pageId, pageTitle) => {
            // Start grading directly from content viewer
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);

            // Fetch the content directly and proceed to column selection
            try {
              const token = await notionOAuthClient.ensureAuthenticated();
              const notionService = new NotionService(token.access_token);
              // For databases, we need to get database content (entries), not page content
              const content = await notionService.getDatabaseContent(pageId);
              setNotionApiContent(content);
              setStep("notion-github-column-select");
            } catch (error) {
              setError(
                `Failed to fetch content for grading: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }}
          onBack={() => setStep("notion-api-page-select")}
        />
      </Box>
    );
  }

  if (step === "notion-github-column-select") {
    return (
      <Box flexDirection="column">
        <GitHubColumnSelector
          notionContent={notionApiContent}
          onSelect={(selectedProperty, githubUrls) => {
            setNotionSelectedProperty(selectedProperty);

            // Convert string[] to the expected format if needed
            const urlsWithIds: Array<{ url: string; pageId: string }> =
              Array.isArray(githubUrls) &&
              githubUrls.length > 0 &&
              typeof githubUrls[0] === "string"
                ? (githubUrls as string[]).map((url) => ({ url, pageId: "" }))
                : (githubUrls as Array<{ url: string; pageId: string }>);

            setNotionGitHubUrls(urlsWithIds);
            setSelectedGitHubColumn(
              selectedProperty.name || selectedProperty.propertyName || ""
            );
            setStep("notion-processing");
          }}
          onError={(error) => {
            setError(error);
            setStep("notion-api-content-view");
          }}
          onBack={() => setStep("notion-api-content-view")}
        />
      </Box>
    );
  }

  if (step === "notion-processing") {
    const progress =
      processingResults.total > 0
        ? (processingResults.processed / processingResults.total) * 100
        : 0;
    const isComplete =
      processingResults.processed === processingResults.total &&
      processingResults.total > 0;

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Processing GitHub Repositories from Notion
        </Text>
        <Text></Text>
        <Text>
          Property: {notionSelectedProperty?.name} (
          {notionSelectedProperty?.type})
        </Text>
        <Text>Total repositories: {processingResults.total}</Text>
        <Text></Text>

        {processingResults.total > 0 && (
          <>
            <Text>
              Progress: {processingResults.processed}/{processingResults.total}{" "}
              ({Math.round(progress)}%)
            </Text>
            <Text></Text>

            {processingResults.currentUrl && !isComplete && (
              <>
                <Text color="yellow">
                  Currently processing: {processingResults.currentUrl}
                </Text>
                <Text></Text>
              </>
            )}

            {processingResults.results.length > 0 && (
              <>
                <Text color="green">
                  ✓ Successful:{" "}
                  {processingResults.results.filter((r) => r.success).length}
                </Text>
                <Text color="red">
                  ✗ Failed:{" "}
                  {processingResults.results.filter((r) => !r.success).length}
                </Text>
                <Text></Text>
              </>
            )}

            {isComplete && (
              <>
                <Text color="green" bold>
                  ✓ Processing Complete!
                </Text>
                <Text></Text>
                <Text dimColor>
                  All repositories have been processed and saved to
                  /test-results/
                </Text>
                <Text dimColor>Redirecting to completion page...</Text>
                <Text></Text>
              </>
            )}
          </>
        )}

        <Text dimColor>
          Each repository is graded individually using{" "}
          {selectedProvider?.name || DEFAULT_PROVIDER.name}
        </Text>
        <Text dimColor>
          Results are saved as separate .md and -scores.json files
        </Text>
        <Text></Text>

        {!isComplete && (
          <BackButton
            onBack={() => setStep("notion-github-column-select")}
            isVisible={true}
          />
        )}
      </Box>
    );
  }

  if (step === "grading-save-options") {
    return (
      <GradingSaveOptions
        gradingResults={gradingResults}
        originalDatabaseId={originalDatabaseId}
        onOptionSelected={handleSaveOptionSelected}
        onError={setError}
      />
    );
  }

  if (step === "notion-saving") {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          Saving Grading Results to Notion...
        </Text>
        <Text></Text>
        <Text>
          Saving {gradingResults.length} grading results to Notion database...
        </Text>
        <Text dimColor>
          This may take a moment to create/update database schema and save
          entries.
        </Text>
      </Box>
    );
  }

  return null;
};
