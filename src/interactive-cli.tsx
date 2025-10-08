import React, { useState, useEffect } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import * as path from "path";
import csv from "csv-parser";
import open from "open";
import { TokenStorage } from "./lib/token-storage.js";
import { E2BTokenStorage } from "./lib/e2b-token-storage.js";
import { GitHubService } from "./github/github-service.js";
import {
  GitHubUrlDetector,
  GitHubUrlDetectionResult,
} from "./lib/github-url-detector.js";
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
import { NotionDataLoading } from "./components/notion/notion-data-loading.js";
import {
  AIProvider,
  DEFAULT_PROVIDER,
  AI_PROVIDERS,
  ComputerUseModel,
  DEFAULT_COMPUTER_USE_MODEL,
} from "./consts/ai-providers.js";
import { SANDBOX_BATCH_SIZE } from "./consts/limits.js";
import { PreferencesStorage } from "./lib/preferences-storage.js";
import {
  GradingSaveOptions,
  SaveOption,
} from "./components/grading-save-options.js";
import { GradingResult, saveBrowserTestResults } from "./lib/file-saver.js";
import { GradingDatabaseService } from "./lib/notion/grading-database-service.js";
import { DeployedUrlSelector } from "./components/deployed-url-selector.js";
import { BrowserTesting } from "./components/browser-testing.js";
import { BrowserTestResult } from "./lib/stagehand/browser-testing-service.js";
import { BrowserTestMode } from "./components/browser-test-mode.js";
import { ComputerUseModelSelector } from "./components/computer-use-model-selector.js";
import { DatabaseFilter, DatabaseProperty, FilterCriteria } from "./components/notion/database-filter.js";
import { PromptSelector } from "./components/prompt-selector.js";
import {
  GradingPrompt,
  getDefaultGradingPrompt,
} from "./consts/grading-prompts.js";

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
  | "e2b-api-key"
  | "validating-e2b-key"
  | "provider-select"
  | "chunking-preference"
  | "computer-use-model-select"
  | "browser-test-mode"
  | "data-source-select"
  | "notion-auth"
  | "notion-auth-loading"
  | "notion-oauth-prompt"
  | "notion-url-input"
  | "notion-fetching"
  | "notion-property-select"
  | "notion-page-selector"
  | "notion-api-content-view"
  | "notion-oauth-info"
  | "notion-database-filter"
  | "notion-filter-confirmation"
  | "notion-filter-loading"
  | "notion-github-column-select"
  | "notion-processing"
  | "processing-choice"
  | "prompt-select"
  | "browser-testing-prompt"
  | "browser-computer-use-model-select"
  | "deployed-url-select"
  | "browser-testing"
  | "grading-save-options"
  | "notion-conflict-check"
  | "notion-saving"
  | "notion-save-complete"
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
  const [selectedComputerUseModel, setSelectedComputerUseModel] =
    useState<ComputerUseModel | null>(null);
  const [selectedBrowserComputerUseModel, setSelectedBrowserComputerUseModel] =
    useState<ComputerUseModel | null>(null);
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [selectedGradingPrompt, setSelectedGradingPrompt] =
    useState<GradingPrompt>(getDefaultGradingPrompt());
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
  const [gitHubUrlDetectionResult, setGitHubUrlDetectionResult] =
    useState<GitHubUrlDetectionResult | null>(null);
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
  const [browserTestResults, setBrowserTestResults] = useState<
    BrowserTestResult[]
  >([]);
  const [deployedUrls, setDeployedUrls] = useState<
    Array<{ url: string; pageId: string }>
  >([]);
  const [selectedDeployedUrlColumn, setSelectedDeployedUrlColumn] =
    useState<string>("");
  const [databaseFilterCriteria, setDatabaseFilterCriteria] = useState<FilterCriteria | null>(null);
  const [databaseProperties, setDatabaseProperties] = useState<DatabaseProperty[]>([]);
  const [originalDatabaseId, setOriginalDatabaseId] = useState<
    string | undefined
  >();
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [validatingE2BKey, setValidatingE2BKey] = useState(false);
  const [e2bKeyValid, setE2BKeyValid] = useState<boolean | null>(null);
  const [skipGitHub, setSkipGitHub] = useState(false);
  const [processingMode, setProcessingMode] = useState<
    "code" | "browser" | "both" | null
  >(null);
  const [selectedProcessingOption, setSelectedProcessingOption] = useState(0); // 0 = code only (default), 1 = browser only, 2 = both
  const [chunkingPreference, setChunkingPreference] = useState<
    "allow" | "skip"
  >("skip");
  const [selectedChunkingOption, setSelectedChunkingOption] = useState(1); // 0 = allow, 1 = skip (default)
  const [notionSaveResult, setNotionSaveResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [selectedNavOption, setSelectedNavOption] = useState(0);
  // Navigation stack to track Notion hierarchy for proper back navigation
  const [notionNavigationStack, setNotionNavigationStack] = useState<
    Array<{ pageId: string; pageTitle: string; contentType: string }>
  >([]);
  // Track if we arrived at column selection from filtered workflow (vs view workflow)
  const [isFilteredWorkflow, setIsFilteredWorkflow] = useState(false);
  const { exit } = useApp();

  // Helper function to navigate to a new step and clear any existing errors
  const navigateToStep = (newStep: Step) => {
    // Clear console when moving between major workflow steps for cleaner UX
    const majorSteps: Step[] = [
      "data-source-select",
      "notion-page-selector",
      "notion-api-content-view",
      "notion-github-column-select",
      "processing-choice",
      "notion-processing",
      "complete",
    ];

    if (majorSteps.includes(newStep) && newStep !== step) {
      console.clear();
    }

    setError(null); // Clear any existing error messages
    setStep(newStep);
  };

  // Convert FilterCriteria to Notion API filter format
  // Based on Notion Data Source API documentation (2025-09-03)
  const convertFilterToNotionAPI = (criteria: FilterCriteria): any => {
    const propertyName = criteria.propertyName;

    switch (criteria.filterType) {
      case 'include':
        if (criteria.propertyType === 'select') {
          const values = criteria.value as string[];
          // Single value: return simple filter
          if (values.length === 1) {
            return {
              property: propertyName,
              select: { equals: values[0] }
            };
          }
          // Multiple values: use OR compound filter
          return {
            or: values.map((val: string) => ({
              property: propertyName,
              select: { equals: val }
            }))
          };
        } else if (criteria.propertyType === 'multi_select') {
          const values = criteria.value as string[];
          // For multi-select, use "contains" for each value with OR
          if (values.length === 1) {
            return {
              property: propertyName,
              multi_select: { contains: values[0] }
            };
          }
          return {
            or: values.map((val: string) => ({
              property: propertyName,
              multi_select: { contains: val }
            }))
          };
        }
        break;

      case 'exclude':
        if (criteria.propertyType === 'select') {
          const values = criteria.value as string[];
          // Use does_not_equal with AND for excluding multiple values
          if (values.length === 1) {
            return {
              property: propertyName,
              select: { does_not_equal: values[0] }
            };
          }
          return {
            and: values.map((val: string) => ({
              property: propertyName,
              select: { does_not_equal: val }
            }))
          };
        } else if (criteria.propertyType === 'multi_select') {
          const values = criteria.value as string[];
          // Use does_not_contain with AND
          if (values.length === 1) {
            return {
              property: propertyName,
              multi_select: { does_not_contain: values[0] }
            };
          }
          return {
            and: values.map((val: string) => ({
              property: propertyName,
              multi_select: { does_not_contain: val }
            }))
          };
        }
        break;

      case 'contains':
        return {
          property: propertyName,
          rich_text: { contains: criteria.value as string }
        };

      case 'not_contains':
        return {
          property: propertyName,
          rich_text: { does_not_contain: criteria.value as string }
        };

      case 'equals':
        if (criteria.propertyType === 'checkbox') {
          return {
            property: propertyName,
            checkbox: { equals: criteria.value as boolean }
          };
        } else if (criteria.propertyType === 'number') {
          return {
            property: propertyName,
            number: { equals: criteria.value as number }
          };
        }
        break;

      case 'not_equals':
        if (criteria.propertyType === 'checkbox') {
          return {
            property: propertyName,
            checkbox: { equals: !(criteria.value as boolean) }
          };
        } else if (criteria.propertyType === 'number') {
          return {
            property: propertyName,
            number: { does_not_equal: criteria.value as number }
          };
        }
        break;

      case 'greater_than':
        return {
          property: propertyName,
          number: { greater_than: criteria.value as number }
        };

      case 'less_than':
        return {
          property: propertyName,
          number: { less_than: criteria.value as number }
        };

      case 'is_empty':
        if (criteria.propertyType === 'select') {
          return {
            property: propertyName,
            select: { is_empty: true }
          };
        } else if (criteria.propertyType === 'multi_select') {
          return {
            property: propertyName,
            multi_select: { is_empty: true }
          };
        } else if (criteria.propertyType === 'rich_text' || criteria.propertyType === 'title') {
          return {
            property: propertyName,
            rich_text: { is_empty: true }
          };
        }
        break;

      case 'is_not_empty':
        if (criteria.propertyType === 'select') {
          return {
            property: propertyName,
            select: { is_not_empty: true }
          };
        } else if (criteria.propertyType === 'multi_select') {
          return {
            property: propertyName,
            multi_select: { is_not_empty: true }
          };
        } else if (criteria.propertyType === 'rich_text' || criteria.propertyType === 'title') {
          return {
            property: propertyName,
            rich_text: { is_not_empty: true }
          };
        }
        break;
    }

    return undefined;
  };


  // Fetch filtered database content when filter is applied
  useEffect(() => {
    if (step === "notion-filter-loading" && notionApiSelectedPageId) {
      const fetchFilteredContent = async () => {
        try {
          const token = await notionOAuthClient.ensureAuthenticated();
          const notionService = new NotionService(token.access_token);

          // Convert filter criteria to Notion API format (if filter is set)
          const notionFilter = databaseFilterCriteria
            ? convertFilterToNotionAPI(databaseFilterCriteria)
            : undefined;

          // Fetch database content with filter using enhanced schema
          // This ensures GitHubUrlDetector gets complete property information
          const databaseId = notionApiSelectedPageId;
          const content = await notionService.queryDatabaseWithEnhancedSchema(
            databaseId,
            notionFilter,
            undefined,
            databaseFilterCriteria // Pass client filter for Search API fallback
          );

          setNotionApiContent(content);

          // Navigate to confirmation screen
          navigateToStep("notion-filter-confirmation");
        } catch (error) {
          setError(
            `Failed to fetch filtered database content: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          navigateToStep("notion-database-filter");
        }
      };

      fetchFilteredContent();
    }
  }, [step, notionApiSelectedPageId, databaseFilterCriteria]);

  // Process GitHub URLs when entering notion-processing step
  useEffect(() => {
    if (
      step === "notion-processing" &&
      notionGitHubUrls.length > 0 &&
      processingMode !== "browser"
    ) {
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

        // Determine which processing method to use (default to sandbox)
        const useGitHubAPI = process.env.GITHUB_API_ONLY === "true";

        // Initialize services once for efficiency
        let githubService: GitHubService | null = null;
        let sandboxService: any = null;

        if (useGitHubAPI) {
          githubService = new GitHubService(githubToken, undefined, maxDepth);
        } else {
          try {
            const { SandboxService } = await import("./lib/sandbox/index.js");
            sandboxService = new SandboxService();
            await sandboxService.initialize();
            console.log(
              `🚀 Using sandbox for processing ${notionGitHubUrls.length} repositories`
            );
          } catch (sandboxError) {
            console.warn(
              `Failed to initialize sandbox, falling back to GitHub API:`,
              sandboxError
            );
            githubService = new GitHubService(githubToken, undefined, maxDepth);
          }
        }

        try {
          if (sandboxService) {
            // Use parallel processing for sandbox (single sandbox, multiple repos)
            console.log(
              `🚀 Processing ${notionGitHubUrls.length} repositories in parallel batches of ${SANDBOX_BATCH_SIZE}`
            );

            // Process URLs in batches for better performance and resource management
            for (
              let i = 0;
              i < notionGitHubUrls.length;
              i += SANDBOX_BATCH_SIZE
            ) {
              const batch = notionGitHubUrls.slice(i, i + SANDBOX_BATCH_SIZE);
              const batchNumber = Math.floor(i / SANDBOX_BATCH_SIZE) + 1;
              const totalBatches = Math.ceil(
                notionGitHubUrls.length / SANDBOX_BATCH_SIZE
              );

              console.log(
                `\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} repositories)`
              );

              // Process batch in parallel
              const batchPromises = batch.map(async (urlItem, batchIndex) => {
                const globalIndex = i + batchIndex;
                const url = urlItem.url;
                const pageId = urlItem.pageId || undefined;

                // Update progress for this specific URL
                setProcessingResults((prev) => ({
                  ...prev,
                  processed: globalIndex,
                  currentUrl: url,
                }));

                try {
                  console.log(
                    `  Processing repository ${globalIndex + 1}/${
                      notionGitHubUrls.length
                    }: ${url}`
                  );

                  const repoInfo = sandboxService.parseGitHubUrl(url);
                  if (!repoInfo) {
                    throw new Error("Invalid GitHub URL format");
                  }

                  const result = await sandboxService.processGitHubUrl(
                    url,
                    selectedProvider || DEFAULT_PROVIDER,
                    chunkingPreference,
                    selectedGradingPrompt.value
                  );

                  const gradingResult = await saveRepositoryFiles(
                    repoInfo,
                    result,
                    url,
                    selectedProvider || DEFAULT_PROVIDER,
                    pageId
                  );

                  // Always collect grading results, even if they contain errors
                  collectedGradingResults.push(gradingResult);

                  console.log(`  ✓ Successfully processed ${url}`);
                  return { url, success: true };
                } catch (error) {
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  console.error(`  ✗ Failed to process ${url}:`, errorMessage);
                  return { url, success: false, error: errorMessage };
                }
              });

              // Wait for all promises in the batch to complete
              const batchResults = await Promise.all(batchPromises);
              results.push(...batchResults);

              // Update progress after batch completion
              setProcessingResults((prev) => ({
                ...prev,
                processed: Math.min(
                  i + SANDBOX_BATCH_SIZE,
                  notionGitHubUrls.length
                ),
                results: [...results],
              }));

              // Add delay between batches to be respectful to resources
              if (i + SANDBOX_BATCH_SIZE < notionGitHubUrls.length) {
                console.log(
                  `  Completed batch ${batchNumber}. Brief pause before next batch...`
                );
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          } else {
            // Fallback to sequential processing for GitHub API
            console.log(
              `⚡ Processing ${notionGitHubUrls.length} repositories sequentially (GitHub API mode)`
            );

            for (let i = 0; i < notionGitHubUrls.length; i++) {
              const urlItem = notionGitHubUrls[i];
              const url = urlItem.url;
              const pageId = urlItem.pageId || undefined;

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

                let result: any;
                let repoInfo: any;

                if (githubService) {
                  repoInfo = githubService.parseGitHubUrl(url);
                  if (repoInfo) {
                    result = await githubService.processGitHubUrl(
                      url,
                      selectedProvider || DEFAULT_PROVIDER,
                      chunkingPreference,
                      selectedGradingPrompt.value
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

                  // Always collect grading results, even if they contain errors
                  collectedGradingResults.push(gradingResult);
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

              // Add delay between sequential requests
              if (i < notionGitHubUrls.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
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

          // Save grading results
          setGradingResults(collectedGradingResults);

          // Determine next step based on processing mode
          setTimeout(() => {
            if (processingMode === "both") {
              // User chose both - go directly to deployed URL selection
              navigateToStep("deployed-url-select");
            } else {
              // User chose code only - go to save options
              navigateToStep("grading-save-options");
            }
          }, 2000);
        } finally {
          // Cleanup sandbox if it was used
          if (sandboxService) {
            console.log(`🧹 Cleaning up sandbox...`);
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
        navigateToStep("notion-github-column-select");
      });
    }
  }, [step, notionGitHubUrls, githubToken, selectedProvider, processingMode]);

  // Initialize and validate token from storage or environment
  useEffect(() => {
    const initializeToken = async () => {
      const savedToken = tokenStorage.getToken();
      const envToken = process.env.GITHUB_TOKEN;
      const token = savedToken || envToken;

      // Load saved provider preference and chunking preference
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

        // Load saved chunking preference, default to 'skip' if not set
        const savedChunkingPreference =
          preferences.gradingConfig?.chunkingPreference || "skip";
        setChunkingPreference(savedChunkingPreference);
        setSelectedChunkingOption(savedChunkingPreference === "skip" ? 1 : 0);
      } catch (error) {
        // Error loading saved preferences is handled gracefully
      }

      if (token) {
        setGithubToken(token);
        setValidatingToken(true);

        try {
          // For token validation, we don't need depth limit configuration
          const githubService = new GitHubService(token);
          const validation = await githubService.validateToken();

          if (validation.valid) {
            setTokenValid(true);
            navigateToStep("e2b-api-key");
          } else {
            setTokenValid(false);
            navigateToStep("github-token");
            // Token validation error is already captured in validation.error
          }
        } catch (error) {
          setTokenValid(false);
          navigateToStep("github-token");
          // Token validation error is already handled in the catch block
        } finally {
          setValidatingToken(false);
        }
      } else {
        navigateToStep("github-token");
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
        navigateToStep("validating-e2b-key");

        try {
          // Validate E2B API key format
          if (e2bTokenStorage.validateKeyFormat(key)) {
            setE2BKeyValid(true);
            navigateToStep("provider-select");
          } else {
            setE2BKeyValid(false);
            navigateToStep("e2b-api-key");
            // E2B API key format validation error is handled in the UI
          }
        } catch (error) {
          setE2BKeyValid(false);
          navigateToStep("e2b-api-key");
          // E2B API key validation error is handled in the catch block
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
      // Remove artificial delay - start checking immediately
      const checkAuth = async () => {
        // Check if user already has authentication
        const storage = new NotionTokenStorage();
        const hasExistingAuth = storage.hasToken();

        if (hasExistingAuth) {
          // Try to use existing auth directly
          try {
            console.log("🔍 Checking existing Notion authentication...");
            const token = await notionOAuthClient.ensureAuthenticated();

            // Validate the token with a test API call
            const { NotionService } = await import(
              "./lib/notion/notion-service.js"
            );
            const service = new NotionService(token.access_token);
            const validation = await service.validateToken();

            if (validation.valid) {
              console.log("✓ Notion authentication is valid");
              navigateToStep("notion-page-selector");
            } else {
              console.log(
                "❌ Notion token validation failed:",
                validation.error
              );
              console.log("🔄 Auto-triggering OAuth re-authentication...");

              // Clear the invalid token
              storage.clearToken();

              // Automatically start OAuth without user intervention
              try {
                const token = await notionOAuthClient.ensureAuthenticated();
                const service = new NotionService(token.access_token);
                const revalidation = await service.validateToken();

                if (revalidation.valid) {
                  console.log("✓ Re-authentication successful");
                  navigateToStep("notion-page-selector");
                } else {
                  throw new Error(
                    revalidation.error || "Re-authentication failed"
                  );
                }
              } catch (reauthError: any) {
                setError(`Re-authentication failed: ${reauthError.message}`);
                navigateToStep("notion-auth-loading");
              }
            }
          } catch (e: any) {
            console.log(
              "❌ Notion authentication error:",
              e.message || String(e)
            );

            // Auto-trigger OAuth for authentication errors
            if (
              e.message?.includes("API token is invalid") ||
              e.message?.includes("unauthorized")
            ) {
              console.log(
                "🔄 Auto-triggering OAuth due to authentication error..."
              );

              // Clear the invalid token
              storage.clearToken();

              // Automatically start OAuth without user intervention
              try {
                const token = await notionOAuthClient.ensureAuthenticated();
                const service = new NotionService(token.access_token);
                const revalidation = await service.validateToken();

                if (revalidation.valid) {
                  console.log("✓ Re-authentication successful");
                  navigateToStep("notion-page-selector");
                } else {
                  throw new Error(
                    revalidation.error || "Re-authentication failed"
                  );
                }
              } catch (reauthError: any) {
                setError(`Re-authentication failed: ${reauthError.message}`);
                navigateToStep("notion-auth-loading");
              }
            } else {
              // For non-auth errors, trigger automatic OAuth
              setError(e.message || "Authentication check failed");
              navigateToStep("notion-auth-loading");
            }
          }
        } else {
          // No existing auth, perform OAuth
          try {
            console.log("🔄 Starting fresh Notion authentication...");
            const token = await notionOAuthClient.ensureAuthenticated();

            // Validate the new token
            const { NotionService } = await import(
              "./lib/notion/notion-service.js"
            );
            const service = new NotionService(token.access_token);
            const validation = await service.validateToken();

            if (validation.valid) {
              console.log("✓ New Notion authentication successful");
              navigateToStep("notion-page-selector");
            } else {
              throw new Error(
                validation.error ||
                  "Token validation failed after authentication"
              );
            }
          } catch (e: any) {
            console.log(
              "❌ Notion authentication failed:",
              e.message || String(e)
            );
            let errorMessage = "Authentication failed";
            if (e.message?.includes("API token is invalid")) {
              errorMessage =
                "The authentication process failed. Please try again.";
            } else if (e.message?.includes("unauthorized")) {
              errorMessage =
                "Access was denied. Please ensure you grant the necessary permissions.";
            } else if (e.message) {
              errorMessage = e.message;
            }
            setError(errorMessage);
            navigateToStep("notion-auth-loading");
          }
        }
      };

      // Execute immediately without delay
      checkAuth();
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
          navigateToStep("notion-url-input");
        } catch (error) {
          console.error("Notion authentication failed:", error);

          // Check if this is OAuth-related
          if (error instanceof Error && (error as any).isOAuthRequired) {
            // Generate OAuth URL and show prompt
            try {
              const authUrl = await notionClient.initiateOAuth();
              setOauthUrl(authUrl);
              navigateToStep("notion-oauth-prompt");
            } catch (oauthError) {
              setError(
                `Failed to generate OAuth URL: ${
                  oauthError instanceof Error
                    ? oauthError.message
                    : String(oauthError)
                }`
              );
              setNotionNavigationStack([]);
              navigateToStep("data-source-select");
            }
          } else {
            setError(
              `Notion authentication failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            setNotionNavigationStack([]);
            navigateToStep("data-source-select");
          }
        }
      };

      handleNotionAuth();
    }
  }, [step, notionClient]);

  // Handle Notion saving with conflict resolution
  useEffect(() => {
    const performNotionSave = async () => {
      if (step === "notion-saving") {
        try {
          // Ensure we have a valid Notion access token before creating the service
          const oauth = new NotionOAuthClient();
          const token = await oauth.ensureAuthenticated();
          const accessToken = token.access_token;

          const service = new GradingDatabaseService(accessToken);

          // Determine processing mode based on what was performed
          const hasBrowserTests =
            browserTestResults && browserTestResults.length > 0;
          const hasCodeGrading = gradingResults && gradingResults.length > 0;
          const processingMode: "code" | "browser" | "both" =
            hasBrowserTests && hasCodeGrading
              ? "both"
              : hasBrowserTests
              ? "browser"
              : "code";

          // Save all grading results (batch processing)
          const result = await service.saveGradingResults(
            originalDatabaseId!,
            gradingResults,
            selectedGitHubColumn,
            browserTestResults,
            processingMode
          );

          // Store the save result for the completion step
          setNotionSaveResult(result);

          if (result.failed > 0) {
            console.log(
              `⚠️ Saved ${result.success} entries, ${result.failed} failed`
            );
          } else {
            console.log(
              `✅ Successfully saved ${result.success} grading results to Notion database`
            );
          }

          navigateToStep("notion-save-complete");
        } catch (error: any) {
          console.error("Notion save operation failed:", error);

          // Provide specific error messages for common issues
          let errorMessage = `Failed to save to Notion: ${error.message}`;
          if (
            error.message.includes("unauthorized") ||
            error.message.includes("Token validation failed")
          ) {
            errorMessage =
              "Authentication failed. Please re-authenticate with Notion and try again.";
          } else if (
            error.message.includes("database_not_found") ||
            error.message.includes("object_not_found")
          ) {
            errorMessage =
              "Database not found. Please ensure you have access to the selected database.";
          }

          // Store the error result for the completion step
          setNotionSaveResult({
            success: 0,
            failed: gradingResults.length,
            errors: [errorMessage],
          });
          setError(errorMessage);
          navigateToStep("notion-save-complete");
        }
      }
    };

    performNotionSave();
  }, [
    step,
    gradingResults,
    browserTestResults,
    originalDatabaseId,
    selectedGitHubColumn,
  ]);

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
        const newToken = input.trim();
        if (newToken) {
          // User entered a new token, validate it
          setValidatingToken(true);

          // Validate the token
          (async () => {
            try {
              // For token validation, we don't need depth limit configuration
              const githubService = new GitHubService(newToken);
              const validation = await githubService.validateToken();

              if (validation.valid) {
                try {
                  tokenStorage.saveToken(newToken);
                  console.log(
                    "✓ Token saved securely to:",
                    tokenStorage.getConfigDir()
                  );
                } catch (err) {
                  // Token saving error is handled gracefully
                }
                setGithubToken(newToken);
                setTokenValid(true);
                navigateToStep("e2b-api-key");
              } else {
                setTokenValid(false);
                navigateToStep("github-token");
                // Token validation error is already captured in validation.error
              }
            } catch (error) {
              setTokenValid(false);
              navigateToStep("github-token");
              // Token validation error is already handled in the catch block
            } finally {
              setValidatingToken(false);
            }
          })();
        } else if (githubToken && tokenValid === true) {
          // User pressed Enter with no input but has a valid existing token, use it
          navigateToStep("e2b-api-key");
        } else {
          // User pressed Enter with no input and no valid token, skip GitHub authentication
          setSkipGitHub(true);
          navigateToStep("e2b-api-key");
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
        navigateToStep("e2b-api-key");
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
          navigateToStep("validating-e2b-key");

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
                    // E2B API key saving error is handled gracefully
                  }
                }
                setE2bApiKey(newKey);
                setE2BKeyValid(true);
                navigateToStep("provider-select");
              } else {
                setE2BKeyValid(false);
                navigateToStep("e2b-api-key");
                // E2B API key format validation error is handled in the UI
              }
            } catch (error) {
              setE2BKeyValid(false);
              navigateToStep("e2b-api-key");
              // E2B API key validation error is handled in the catch block
            } finally {
              setValidatingE2BKey(false);
            }
          })();
        } else {
          // Skip E2B, proceed to provider selection
          navigateToStep("provider-select");
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
        navigateToStep("provider-select");
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
        navigateToStep("notion-auth-loading");
      } else if (inputChar === "b") {
        // Go back to data source selection
        setNotionNavigationStack([]);
        navigateToStep("data-source-select");
      }
    } else if (step === "notion-url-input") {
      if (key.return) {
        if (input.trim()) {
          setNotionDatabaseUrl(input.trim());
          navigateToStep("notion-fetching");

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
                navigateToStep("notion-property-select");
              } else {
                setError("Could not fetch database from URL");
                navigateToStep("notion-url-input");
              }
            } catch (error) {
              setError(
                `Failed to fetch database: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
              navigateToStep("notion-url-input");
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
        navigateToStep("loading");
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
          navigateToStep("complete");
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
          navigateToStep("analyzing");
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
            navigateToStep("select");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            navigateToStep("input"); // Return to input step to let user try again
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
        navigateToStep("github-token");
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
        navigateToStep("loading");
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
          navigateToStep("complete");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          onError(err instanceof Error ? err.message : String(err));
          exit();
        }
      }
    } else if (step === "chunking-preference") {
      if (key.upArrow) {
        setSelectedChunkingOption((prev) => (prev > 0 ? prev - 1 : 1));
      } else if (key.downArrow) {
        setSelectedChunkingOption((prev) => (prev < 1 ? prev + 1 : 0));
      } else if (key.return) {
        // Save the preference
        const preference = selectedChunkingOption === 0 ? "allow" : "skip";
        setChunkingPreference(preference);

        // Save to preferences storage
        const prefs = await preferencesStorage.loadPreferences();
        await preferencesStorage.savePreferences({
          ...prefs,
          gradingConfig: {
            ...prefs?.gradingConfig,
            chunkingPreference: preference,
          },
        });

        // Navigate to next step
        navigateToStep("data-source-select");
      }
    } else if (step === "processing-choice") {
      if (key.upArrow) {
        setSelectedProcessingOption((prev) => (prev > 0 ? prev - 1 : 2));
      } else if (key.downArrow) {
        setSelectedProcessingOption((prev) => (prev < 2 ? prev + 1 : 0));
      } else if (key.return) {
        if (selectedProcessingOption === 0) {
          // Grade repository code - need to clone and process, first select prompt
          setProcessingMode("code");
          navigateToStep("prompt-select");
        } else if (selectedProcessingOption === 1) {
          // Test deployed applications only - skip cloning, go directly to deployed URL selection
          setProcessingMode("browser");
          navigateToStep("deployed-url-select");
        } else if (selectedProcessingOption === 2) {
          // Do both - clone and process first, then browser test, first select prompt
          setProcessingMode("both");
          navigateToStep("prompt-select");
        }
      }
    } else if (step === "browser-testing-prompt") {
      if (inputChar === "y") {
        // Start browser testing - first select computer use model
        navigateToStep("browser-computer-use-model-select");
      } else if (inputChar === "n") {
        // Skip browser testing and go directly to save options
        navigateToStep("grading-save-options");
      }
    } else if (step === "notion-filter-confirmation") {
      if (key.upArrow && selectedNavOption > 0) {
        setSelectedNavOption(selectedNavOption - 1);
      } else if (key.downArrow && selectedNavOption < 1) {
        setSelectedNavOption(selectedNavOption + 1);
      } else if (key.return) {
        if (selectedNavOption === 0) {
          // Continue to column selection
          setSelectedNavOption(0);
          setIsFilteredWorkflow(true); // Mark that we're in filtered workflow
          navigateToStep("notion-github-column-select");
        } else if (selectedNavOption === 1) {
          // Back to filter selection
          setSelectedNavOption(0);
          navigateToStep("notion-database-filter");
        }
      } else if (inputChar === 'b' || key.escape) {
        // Go back to page selector
        setSelectedNavOption(0);
        navigateToStep("notion-page-selector");
      }
    } else if (step === "notion-save-complete") {
      if (key.upArrow && selectedNavOption > 0) {
        setSelectedNavOption(selectedNavOption - 1);
      } else if (key.downArrow && selectedNavOption < 2) {
        setSelectedNavOption(selectedNavOption + 1);
      } else if (key.return) {
        if (selectedNavOption === 0) {
          // Back to Save Options
          navigateToStep("grading-save-options");
        } else if (selectedNavOption === 1) {
          // Choose Different Database
          navigateToStep("notion-page-selector");
        } else if (selectedNavOption === 2) {
          // Exit
          navigateToStep("complete");
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
        navigateToStep("complete");
      } else if (option === "original-database" || option === "new-database") {
        if (!databaseId) {
          setError("Database ID is required for Notion saving");
          return;
        }

        // Show schema checking step
        navigateToStep("notion-conflict-check");

        // Ensure we have a valid Notion access token before creating the service
        const oauth = new NotionOAuthClient();
        const token = await oauth.ensureAuthenticated();
        const accessToken = token.access_token;

        const service = new GradingDatabaseService(accessToken);

        // Determine processing mode based on what was performed
        const hasBrowserTests =
          browserTestResults && browserTestResults.length > 0;
        const hasCodeGrading = gradingResults && gradingResults.length > 0;
        const processingMode: "code" | "browser" | "both" =
          hasBrowserTests && hasCodeGrading
            ? "both"
            : hasBrowserTests
            ? "browser"
            : "code";

        // Ensure database has grading schema, but skip github_url column if we already have one
        await service.ensureGradingDatabase(databaseId, {
          skipGithubUrlColumn: selectedGitHubColumn,
          processingMode,
        });

        // Proceed directly to saving (conflict checking will happen row-by-row)
        navigateToStep("notion-saving");
      }
    } catch (error: any) {
      console.error("Failed to prepare Notion save:", error);

      // Provide specific error messages for common issues
      let errorMessage = `Failed to prepare Notion save: ${error.message}`;
      if (
        error.message.includes("unauthorized") ||
        error.message.includes("Token validation failed")
      ) {
        errorMessage =
          "Authentication failed. Please re-authenticate with Notion and try again.";
      } else if (
        error.message.includes("database_not_found") ||
        error.message.includes("object_not_found")
      ) {
        errorMessage =
          "Database not found. Please ensure you have access to the selected database.";
      }

      setError(errorMessage);
      navigateToStep("grading-save-options");
    }
  };

  // All conditional rendering in a single return statement
  if (step === "github-token") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          GitHub API Rate Limits (Optional)
        </Text>
        <Text></Text>
        <Text color="green" bold>
          ✓ Press Enter to skip GitHub setup and continue
        </Text>
        <Text></Text>
        <Text>
          The app works without a token (60 requests/hour). Optionally provide a
          token for higher limits (5,000 requests/hour):
        </Text>
        <Text></Text>
        <Text color="cyan">
          • Press Enter to skip and continue with 60 requests/hour
        </Text>
        <Text color="yellow">• Press 's' to skip GitHub authentication</Text>
        <Text dimColor>
          • Press 'o' to open GitHub token generation page in browser
        </Text>
        <Text dimColor>• Generate a token with 'public_repo' scope</Text>
        <Text dimColor>• Press 'c' to clear stored token and start fresh</Text>
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
        <Text>Enter GitHub token [OPTIONAL - Press Enter to skip]:</Text>
        <Box>
          <Text color="green">{"> "}</Text>
          <Text>{input.replace(/./g, "*")}</Text>
          <Text color="gray">█</Text>
        </Box>
        <Text color="green">
          Commands: Enter = skip and continue | 's' = skip | 'o' = open GitHub |
          'c' = clear token | Ctrl+C = exit
        </Text>
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
            {e2bApiKey
              ? "****************************" + e2bApiKey.slice(-4)
              : "None"}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">Stored in: </Text>
          <Text color="gray">{e2bTokenStorage.getConfigDir()}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="cyan">Enter E2B API key (or press Enter to skip):</Text>
          <Text color="white">&gt; {input.replace(/./g, "*")}█</Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">
            Commands: 'o' = open E2B dashboard | 'c' = clear key | 's' = skip |
            Enter = continue | Ctrl+C = exit
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
    return (
      <NotionDataLoading
        title="Notion Authentication"
        message="Connecting to Notion and authenticating your access..."
      />
    );
  }

  if (step === "provider-select") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🤖 Select AI Provider or Test Mode
        </Text>
        <Text></Text>
        <Text>
          Choose your preferred AI provider for grading, or test browser
          automation:
        </Text>
        <Text></Text>
        <Text color="yellow" bold>
          🧪 Press 't' for Browser Test Mode (Debug 3 URLs)
        </Text>
        <Text dimColor>
          {" "}
          Test browser automation with 3 sample URLs for debugging
        </Text>
        <Text></Text>
        <Text>Or select an AI provider:</Text>
        <Text></Text>
        <ProviderSelector
          onSelect={(provider) => {
            setSelectedProvider(provider);
            navigateToStep("chunking-preference");
          }}
          onTestMode={() => {
            navigateToStep("computer-use-model-select");
          }}
        />
      </Box>
    );
  }

  if (step === "chunking-preference") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🔄 Large Codebase Handling
        </Text>
        <Text></Text>
        <Text>
          How should we handle repositories that exceed the AI model's context
          window?
        </Text>
        <Text></Text>
        <Text dimColor>
          Context window limits: Gemini (128K), GPT-4 (2M), Claude (200K tokens)
        </Text>
        <Text></Text>
        <Text color="cyan">Use ↑/↓ arrows to navigate, Enter to select:</Text>
        <Text></Text>
        <Text
          color={selectedChunkingOption === 0 ? "green" : "white"}
          bold={selectedChunkingOption === 0}
        >
          {selectedChunkingOption === 0 ? "→ " : "  "}Process with chunking
        </Text>
        <Text dimColor>
          {" "}
          • Split large repos into chunks for parallel processing
        </Text>
        <Text dimColor> • May take longer but processes entire codebase</Text>
        <Text dimColor> • Aggregates feedback from all chunks</Text>
        <Text></Text>
        <Text
          color={selectedChunkingOption === 1 ? "yellow" : "white"}
          bold={selectedChunkingOption === 1}
        >
          {selectedChunkingOption === 1 ? "→ " : "  "}Skip large repositories{" "}
          {selectedChunkingOption === 1 ? "(recommended)" : ""}
        </Text>
        <Text dimColor> • Skip repositories that exceed context limits</Text>
        <Text dimColor> • Faster processing for batches with large repos</Text>
        <Text dimColor> • Large repos will be marked as skipped</Text>
        <Text></Text>
        <Text dimColor>This preference will be saved for future sessions</Text>
      </Box>
    );
  }

  if (step === "computer-use-model-select") {
    return (
      <ComputerUseModelSelector
        onModelSelected={(model) => {
          setSelectedComputerUseModel(model);
          navigateToStep("browser-test-mode");
        }}
        onBack={() => {
          navigateToStep("provider-select");
        }}
      />
    );
  }

  if (step === "browser-computer-use-model-select") {
    return (
      <ComputerUseModelSelector
        onModelSelected={(model) => {
          setSelectedBrowserComputerUseModel(model);
          navigateToStep("deployed-url-select");
        }}
        onBack={() => {
          navigateToStep("browser-testing-prompt");
        }}
      />
    );
  }

  if (step === "browser-test-mode") {
    return (
      <BrowserTestMode
        selectedModel={selectedComputerUseModel}
        onBack={() => {
          navigateToStep("computer-use-model-select");
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
              navigateToStep("input");
            } else if (source === "notion") {
              navigateToStep("notion-auth-loading");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "notion-oauth-info") {
    return (
      <Box flexDirection="column">
        {error && (
          <>
            <Text color="red">❌ {error}</Text>
            <Text></Text>
          </>
        )}
        <NotionOAuthInfo
          onContinue={() => {
            setError(null); // Clear previous errors
            navigateToStep("notion-auth-loading");
            // The useEffect hook will handle the OAuth flow
          }}
          onBack={() => {
            setError(null);
            setNotionNavigationStack([]);
            navigateToStep("data-source-select");
          }}
          onClear={() => {
            const storage = new NotionTokenStorage();
            storage.clearToken();
            setError(null);
            console.log("🧹 Notion access cleared");
          }}
          hasAccess={(() => {
            const storage = new NotionTokenStorage();
            return storage.hasValidToken();
          })()}
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
      <NotionDataLoading
        title="Fetching Notion Database"
        message="Connecting to database and retrieving information..."
      />
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

  if (step === "notion-page-selector") {
    return (
      <Box flexDirection="column">
        <NotionPageSelector
          onSelect={(pageId, pageTitle, type) => {
            // Clear navigation stack when selecting from top-level page selector
            setNotionNavigationStack([]);
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(type);
            navigateToStep("notion-api-content-view");
          }}
          onStartGrading={async (pageId, pageTitle) => {
            // Start grading - first get schema for filtering, then fetch filtered data
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType("database"); // onStartGrading is only for databases

            try {
              const token = await notionOAuthClient.ensureAuthenticated();
              const notionService = new NotionService(token.access_token);

              // Get database properties for filtering (no data fetch yet)
              const dbProperties = await notionService.getDatabaseProperties(pageId);
              const filterableProps: DatabaseProperty[] = Object.entries(dbProperties)
                .filter(([_, prop]) =>
                  ['select', 'multi_select', 'rich_text', 'title', 'checkbox', 'number'].includes(prop.type)
                )
                .map(([name, prop]) => ({
                  name,
                  type: prop.type,
                  options: (prop as any).select?.options || (prop as any).multi_select?.options
                }));

              setDatabaseProperties(filterableProps);

              // Navigate to database filter step FIRST (before fetching data)
              navigateToStep("notion-database-filter");
            } catch (error) {
              setError(
                `Failed to prepare database for grading: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }}
          onAuthenticationRequired={() => {
            // Clear error and trigger automatic OAuth re-authentication
            setError(null);
            console.log(
              "🔄 Authentication required, triggering automatic OAuth flow..."
            );
            navigateToStep("notion-auth-loading");
          }}
          onError={(error) => {
            setError(error);
            setNotionNavigationStack([]);
            navigateToStep("data-source-select");
          }}
          onBack={() => {
            // Clear navigation stack when returning to data source select
            setNotionNavigationStack([]);
            navigateToStep("data-source-select");
          }}
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
            setIsFilteredWorkflow(false); // Mark that we're in view workflow
            navigateToStep("notion-github-column-select");
          }}
          onNavigate={(pageId, pageTitle, contentType) => {
            // Push current page to navigation stack before navigating to new page
            setNotionNavigationStack([
              ...notionNavigationStack,
              {
                pageId: notionApiSelectedPageId,
                pageTitle: notionApiSelectedPageTitle,
                contentType: notionApiContentType,
              },
            ]);
            // Navigate to a new page/database
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(contentType || "");
            // Stay in the same step to show the new content
          }}
          onStartGrading={async (pageId, pageTitle) => {
            // Start grading - first get schema for filtering, then fetch filtered data
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType("database"); // onStartGrading is only for databases

            try {
              const token = await notionOAuthClient.ensureAuthenticated();
              const notionService = new NotionService(token.access_token);

              // Get database properties for filtering (no data fetch yet)
              const dbProperties = await notionService.getDatabaseProperties(pageId);
              const filterableProps: DatabaseProperty[] = Object.entries(dbProperties)
                .filter(([_, prop]) =>
                  ['select', 'multi_select', 'rich_text', 'title', 'checkbox', 'number'].includes(prop.type)
                )
                .map(([name, prop]) => ({
                  name,
                  type: prop.type,
                  options: (prop as any).select?.options || (prop as any).multi_select?.options
                }));

              setDatabaseProperties(filterableProps);

              // Navigate to database filter step FIRST (before fetching data)
              navigateToStep("notion-database-filter");
            } catch (error) {
              setError(
                `Failed to prepare database for grading: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
          }}
          onBack={() => {
            // Pop from navigation stack if not empty, otherwise return to page selector
            if (notionNavigationStack.length > 0) {
              const previousPage = notionNavigationStack[notionNavigationStack.length - 1];
              setNotionNavigationStack(notionNavigationStack.slice(0, -1));
              setNotionApiSelectedPageId(previousPage.pageId);
              setNotionApiSelectedPageTitle(previousPage.pageTitle);
              setNotionApiContentType(previousPage.contentType);
              // Stay in same step to show the previous content
            } else {
              // At top level, return to page selector
              navigateToStep("notion-page-selector");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "notion-database-filter") {
    return (
      <DatabaseFilter
        properties={databaseProperties}
        onFilter={(criteria) => {
          setDatabaseFilterCriteria(criteria);
          // Navigate to loading step to fetch filtered data
          navigateToStep("notion-filter-loading");
        }}
        onSkip={() => {
          // No filter - process all rows
          setDatabaseFilterCriteria(null);
          // Navigate to loading step to fetch all data
          navigateToStep("notion-filter-loading");
        }}
        onBack={() => {
          navigateToStep("notion-page-selector");
        }}
      />
    );
  }

  if (step === "notion-filter-loading") {
    return (
      <NotionDataLoading
        title="Fetching Database Content"
        message={databaseFilterCriteria
          ? "Applying filters and loading entries..."
          : "Loading all database entries..."}
      />
    );
  }

  if (step === "notion-filter-confirmation") {
    const rowCount = notionApiContent?.entries?.length || 0;
    const filterSummary = databaseFilterCriteria
      ? `${databaseFilterCriteria.propertyName} - ${databaseFilterCriteria.filterType}`
      : "No filter (all rows)";

    const filterValue = databaseFilterCriteria?.value
      ? Array.isArray(databaseFilterCriteria.value)
        ? (databaseFilterCriteria.value as string[]).join(', ')
        : String(databaseFilterCriteria.value)
      : null;

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>
          Filter Applied - Confirmation
        </Text>
        <Text></Text>
        {error && (
          <>
            <Text color="red">Error: {error}</Text>
            <Text></Text>
          </>
        )}
        <Text color="yellow" bold>
          Database: {notionApiSelectedPageTitle}
        </Text>
        <Text color="yellow" bold>
          Rows to be graded: {rowCount}
        </Text>
        <Text></Text>
        <Text bold>Filter Details:</Text>
        <Text>  Property: {databaseFilterCriteria?.propertyName || "None"}</Text>
        <Text>  Type: {databaseFilterCriteria?.filterType || "N/A"}</Text>
        {filterValue && <Text>  Value: {filterValue}</Text>}
        <Text></Text>
        <Text color="gray" dimColor>
          {rowCount === 0
            ? "⚠️  No rows match the filter criteria. Please adjust your filter or go back."
            : rowCount === 1
            ? "1 row will be processed for grading."
            : `${rowCount} rows will be processed for grading.`}
        </Text>
        <Text></Text>
        <Box>
          <Text color={selectedNavOption === 0 ? "cyan" : "white"} bold={selectedNavOption === 0}>
            {selectedNavOption === 0 ? "→ " : "  "}Continue to Column Selection
          </Text>
        </Box>
        <Box>
          <Text color={selectedNavOption === 1 ? "cyan" : "white"} bold={selectedNavOption === 1}>
            {selectedNavOption === 1 ? "→ " : "  "}Back to Filter
          </Text>
        </Box>
        <Text></Text>
        <Text color="gray" dimColor>
          [Use arrow keys to navigate, Enter to select]
        </Text>
        <Text></Text>
        <BackButton
          onBack={() => navigateToStep("notion-page-selector")}
          label="Page Selector"
          isVisible={true}
        />
      </Box>
    );
  }

  if (step === "notion-github-column-select") {
    // Data is already filtered at the API level, no need for client-side filtering
    return (
      <Box flexDirection="column">
        <GitHubColumnSelector
          notionContent={notionApiContent}
          onSelect={(selectedProperty, githubUrls) => {
            setNotionSelectedProperty(selectedProperty);

            // Handle both URL formats - preserve pageIds when available from database entries
            let urlsWithIds: Array<{ url: string; pageId: string }> = [];

            if (Array.isArray(githubUrls) && githubUrls.length > 0) {
              if (typeof githubUrls[0] === "string") {
                // Legacy string array format - no pageIds available
                console.log(
                  "⚠️ Received string URLs without pageIds - new entries will be created"
                );
                urlsWithIds = (githubUrls as string[]).map((url) => ({
                  url,
                  pageId: "",
                }));
              } else if (
                typeof githubUrls[0] === "object" &&
                githubUrls[0] !== null
              ) {
                // Object format with pageIds - use for updating existing entries
                const urlObjects = githubUrls as Array<{
                  url: string;
                  pageId: string;
                }>;
                console.log(
                  `✅ Received ${urlObjects.length} URLs with pageIds for updating existing entries:`,
                  urlObjects.map((u) => `${u.url} -> ${u.pageId}`)
                );
                urlsWithIds = urlObjects;
              }
            }

            setNotionGitHubUrls(urlsWithIds);
            setSelectedGitHubColumn(
              selectedProperty.name || selectedProperty.propertyName || ""
            );
            navigateToStep("processing-choice");
          }}
          onError={(error) => {
            // Don't use navigateToStep since it clears errors
            // Set step first, then set error so it persists
            setStep(isFilteredWorkflow ? "notion-filter-confirmation" : "notion-api-content-view");
            setError(error);
          }}
          onBack={() => {
            // Navigate back based on workflow path
            navigateToStep(isFilteredWorkflow ? "notion-filter-confirmation" : "notion-api-content-view");
          }}
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
            onBack={() => navigateToStep("notion-github-column-select")}
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

  if (step === "notion-conflict-check") {
    return (
      <Box flexDirection="column">
        <Text color="yellow" bold>
          Checking Database Schema...
        </Text>
        <Text></Text>
        <Text>
          Checking if grading fields already exist in Notion database...
        </Text>
        <Text dimColor>
          This will help prevent accidentally overwriting existing grading data.
        </Text>
      </Box>
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

  if (step === "notion-save-complete") {
    const wasSuccessful = notionSaveResult && notionSaveResult.success > 0;
    const hasFailures = notionSaveResult && notionSaveResult.failed > 0;

    return (
      <Box flexDirection="column" marginY={1}>
        {wasSuccessful ? (
          <Text color="green" bold>
            ✅ Notion Save Complete!
          </Text>
        ) : (
          <Text color="red" bold>
            ❌ Notion Save Failed
          </Text>
        )}
        <Text></Text>

        {notionSaveResult && (
          <>
            <Text>
              Results: {notionSaveResult.success} saved
              {hasFailures ? `, ${notionSaveResult.failed} failed` : ""}
            </Text>
            {hasFailures && notionSaveResult.errors.length > 0 && (
              <>
                <Text></Text>
                <Text color="red">
                  Errors: {notionSaveResult.errors.slice(0, 2).join("; ")}
                  {notionSaveResult.errors.length > 2 && "..."}
                </Text>
              </>
            )}
            <Text></Text>
          </>
        )}

        <Text>What would you like to do next?</Text>
        <Text></Text>

        <Text color={selectedNavOption === 0 ? "cyan" : "white"}>
          {selectedNavOption === 0 ? "→ " : "  "}Back to Save Options
        </Text>
        <Text color={selectedNavOption === 1 ? "cyan" : "white"}>
          {selectedNavOption === 1 ? "→ " : "  "}Choose Different Database
        </Text>
        <Text color={selectedNavOption === 2 ? "cyan" : "white"}>
          {selectedNavOption === 2 ? "→ " : "  "}Exit
        </Text>

        <Text></Text>
        <Text color="gray" dimColor>
          [Use arrow keys to navigate, press Enter to select]
        </Text>
      </Box>
    );
  }

  if (step === "processing-choice") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🎯 Choose Processing Type
        </Text>
        <Text></Text>
        <Text>
          Found {notionGitHubUrls.length} GitHub repositories. What would you
          like to do?
        </Text>
        <Text></Text>
        <Text color="cyan">Use ↑/↓ arrows to navigate, Enter to select:</Text>
        <Text></Text>
        <Text
          color={selectedProcessingOption === 0 ? "blue" : "white"}
          bold={selectedProcessingOption === 0}
        >
          {selectedProcessingOption === 0 ? "→ " : "  "}Grade repository code
          only {selectedProcessingOption === 0 ? "(recommended)" : ""}
        </Text>
        <Text dimColor>
          {" "}
          • Clone and analyze code quality, structure, best practices
        </Text>
        <Text dimColor> • Generate grading reports and save results</Text>
        <Text></Text>
        <Text
          color={selectedProcessingOption === 1 ? "magenta" : "white"}
          bold={selectedProcessingOption === 1}
        >
          {selectedProcessingOption === 1 ? "→ " : "  "}Test deployed
          applications only
        </Text>
        <Text dimColor>
          {" "}
          • Skip cloning - directly test deployed web applications
        </Text>
        <Text dimColor> • Capture screenshots and verify functionality</Text>
        <Text></Text>
        <Text
          color={selectedProcessingOption === 2 ? "yellow" : "white"}
          bold={selectedProcessingOption === 2}
        >
          {selectedProcessingOption === 2 ? "→ " : "  "}Do both
        </Text>
        <Text dimColor>
          {" "}
          • Clone and grade code THEN test deployed applications
        </Text>
        <Text dimColor> • Comprehensive analysis with complete results</Text>
        <Text></Text>
        <Text color="cyan">Use ↑/↓ arrows to navigate, Enter to select</Text>
      </Box>
    );
  }

  if (step === "browser-testing-prompt") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🌐 Browser Testing Available
        </Text>
        <Text></Text>
        <Text>
          Repository analysis complete! Would you like to test deployed
          applications?
        </Text>
        <Text></Text>
        <Text color="green">
          ✓ Processed {gradingResults.length} repositories
        </Text>
        <Text></Text>
        <Text>
          Browser testing can automatically interact with deployed web
          applications to verify functionality and capture screenshots.
        </Text>
        <Text></Text>
        <Text color="cyan">• Press 'y' to set up browser testing</Text>
        <Text color="yellow">• Press 'n' to skip and save results</Text>
        <Text></Text>
      </Box>
    );
  }

  if (step === "deployed-url-select") {
    return (
      <Box flexDirection="column">
        <DeployedUrlSelector
          notionContent={notionApiContent}
          onSelect={(selectedProperty, deployedAppUrls) => {
            setNotionSelectedProperty(selectedProperty);

            // Handle both URL formats - preserve pageIds when available from database entries
            let urlsWithIds: Array<{ url: string; pageId: string }> = [];

            if (Array.isArray(deployedAppUrls) && deployedAppUrls.length > 0) {
              if (typeof deployedAppUrls[0] === "string") {
                // Legacy string array format - no pageIds available
                console.log(
                  "⚠️ Received deployed URLs without pageIds - new entries will be created"
                );
                urlsWithIds = (deployedAppUrls as string[]).map((url) => ({
                  url,
                  pageId: "",
                }));
              } else if (
                typeof deployedAppUrls[0] === "object" &&
                deployedAppUrls[0] !== null
              ) {
                // Object format with pageIds - use for updating existing entries
                const urlObjects = deployedAppUrls as Array<{
                  url: string;
                  pageId: string;
                }>;
                console.log(
                  `✅ Received ${urlObjects.length} deployed URLs with pageIds for updating existing entries:`,
                  urlObjects.map((u) => `${u.url} -> ${u.pageId}`)
                );
                urlsWithIds = urlObjects;
              }
            }

            setDeployedUrls(urlsWithIds);
            setSelectedDeployedUrlColumn(
              selectedProperty.name || selectedProperty.propertyName || ""
            );
            navigateToStep("browser-testing");
          }}
          onError={(error) => {
            setError(error);
            // Go back based on how user got here
            if (processingMode === "browser") {
              navigateToStep("processing-choice");
            } else {
              navigateToStep("browser-testing-prompt");
            }
          }}
          onBack={() => {
            // Go back based on how user got here
            if (processingMode === "browser") {
              navigateToStep("processing-choice");
            } else {
              navigateToStep("browser-testing-prompt");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "browser-testing") {
    return (
      <Box flexDirection="column">
        <BrowserTesting
          deployedUrls={deployedUrls}
          aiProvider={selectedProvider || undefined}
          selectedModel={selectedBrowserComputerUseModel}
          onComplete={(results) => {
            setBrowserTestResults(results);

            // Save browser test results to files
            if (results.length > 0) {
              saveBrowserTestResults(results, selectedDeployedUrlColumn);
            }

            console.log(
              `✓ Browser testing completed: ${results.length} URLs tested`
            );
            navigateToStep("grading-save-options");
          }}
          onError={(error) => {
            setError(error);
            navigateToStep("deployed-url-select");
          }}
          onBack={() => navigateToStep("deployed-url-select")}
        />
      </Box>
    );
  }

  if (step === "prompt-select") {
    return (
      <Box flexDirection="column">
        <PromptSelector
          onSelect={(prompt) => {
            setSelectedGradingPrompt(prompt);
            navigateToStep("notion-processing");
          }}
          onBack={() => {
            navigateToStep("processing-choice");
          }}
        />
      </Box>
    );
  }

  return null;
};
