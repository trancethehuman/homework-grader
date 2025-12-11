import React, { useState, useEffect } from "react";
import { Text, Box, useInput, useApp } from "ink";
import * as fs from "fs";
import open from "open";
import {
  CSVColumn,
  CSVAnalysis,
  validateAndAnalyzeCSV,
  loadGitHubUrlsFromColumn,
} from "./lib/utils/csv-utils.js";
import { GitHubUrlParser } from "./lib/github/github-url-parser.js";
import { TokenStorage } from "./lib/storage/token-storage.js";
import { E2BTokenStorage } from "./lib/storage/e2b-token-storage.js";
import { GitHubService } from "./github/github-service.js";
import {
  GitHubUrlDetector,
  GitHubUrlDetectionResult,
} from "./lib/github/github-url-detector.js";
import { saveRepositoryFiles } from "./lib/utils/file-saver.js";
import { ProviderSelector } from "./components/provider-selector.js";
import {
  GradingModeSelector,
  GradingMode,
} from "./components/grading-mode-selector.js";
import { ProfileSelector } from "./components/profile-selector.js";
import type { ProfileType } from "./lib/storage/profile-storage.js";
import {
  LocalToolSelector,
  LocalTool,
} from "./components/local-tool-selector.js";
import { LocalRepoPathInput } from "./components/local-repo-path-input.js";
import { CodexStarting } from "./components/codex-starting.js";
import { ParallelCodexBatch } from "./components/parallel-codex-batch.js";
import { ParallelInstanceSelector } from "./components/parallel-instance-selector.js";
import {
  WorkflowModeSelector,
  WorkflowMode,
} from "./components/workflow-mode-selector.js";
import {
  CodexMenuSelector,
  CodexMenuOption,
} from "./components/codex-menu-selector.js";
import {
  DataSourceSelector,
  DataSource,
} from "./components/data-source-selector.js";
import {
  GradingMethodSelector,
  GradingMethod,
} from "./components/grading-method-selector.js";
import { ManualUrlInput } from "./components/manual-url-input.js";
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
import { PreferencesStorage } from "./lib/storage/preferences-storage.js";
import { RateLimiter } from "./lib/utils/rate-limiter.js";
import {
  GradingSaveOptions,
  SaveOption,
} from "./components/grading-save-options.js";
import { GitHubIssueTitleInput } from "./components/github-issue-title-input.js";
import {
  GitHubIssueCreationProgress,
  IssueCreationResults,
} from "./components/github-issue-creation-progress.js";
import { GradingResult, saveBrowserTestResults } from "./lib/utils/file-saver.js";
import { GradingDatabaseService } from "./lib/notion/grading-database-service.js";
import { DeployedUrlSelector } from "./components/deployed-url-selector.js";
import { BrowserTesting } from "./components/browser-testing.js";
import { BrowserTestResult } from "./lib/stagehand/browser-testing-service.js";
import { BrowserTestMode } from "./components/browser-test-mode.js";
import { ComputerUseModelSelector } from "./components/computer-use-model-selector.js";
import {
  DatabaseFilter,
  DatabaseProperty,
  FilterCriteria,
} from "./components/notion/database-filter.js";
import { convertFilterToNotionAPI } from "./lib/notion/filter-converter.js";
import { PromptSelector } from "./components/prompt-selector.js";
import {
  GradingPrompt,
  getDefaultGradingPrompt,
} from "./consts/grading-prompts.js";
import {
  GitHubRepoSearchSelector,
  CollaboratorDataSourceSelector,
  CollaboratorUsernameInput,
  CollaboratorCsvColumnSelector,
  CollaboratorNotionColumnSelector,
  CollaboratorAddProgress,
  CollaboratorAddSummary,
  CollaboratorConfirm,
  CollaboratorResults,
} from "./components/collaborator/index.js";
import { GitHubAuthInput } from "./components/github-auth-input.js";
import type { CollaboratorDataSource } from "./components/collaborator/collaborator-data-source-selector.js";

export type { CSVColumn, CSVAnalysis } from "./lib/utils/csv-utils.js";

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
  | "profile-select"
  | "grading-mode-select"
  | "parallel-instance-select"
  | "batch-codex-prompt-select"
  | "parallel-codex-test"
  | "local-tool-select"
  | "local-repo-path-input"
  | "codex-prompt-select"
  | "codex-starting"
  | "github-token"
  | "e2b-api-key"
  | "validating-e2b-key"
  | "workflow-mode-select"
  | "codex-menu"
  | "provider-select"
  | "chunking-preference"
  | "computer-use-model-select"
  | "browser-test-mode"
  | "data-source-select"
  | "grading-method-select"
  | "manual-url-input"
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
  | "github-issue-title-input"
  | "github-issue-creation"
  | "github-issue-complete"
  | "notion-conflict-check"
  | "notion-saving"
  | "notion-save-complete"
  | "input"
  | "analyzing"
  | "select"
  | "loading"
  | "complete"
  | "collaborator-github-auth"
  | "collaborator-repo-search"
  | "collaborator-data-source"
  | "collaborator-manual-input"
  | "collaborator-csv-input"
  | "collaborator-csv-column-select"
  | "collaborator-notion-loading"
  | "collaborator-notion-page-select"
  | "collaborator-notion-content-view"
  | "collaborator-notion-column"
  | "collaborator-confirm"
  | "collaborator-adding"
  | "collaborator-summary";

export const InteractiveCSV: React.FC<InteractiveCSVProps> = ({
  onComplete,
  onError,
}) => {
  const [step, setStep] = useState<Step>("profile-select");
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
  const [selectedWorkflowMode, setSelectedWorkflowMode] =
    useState<WorkflowMode | null>(null);
  const [selectedGradingMode, setSelectedGradingMode] =
    useState<GradingMode | null>(null);
  const [activeProfile, setActiveProfile] = useState<ProfileType | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [selectedLocalTool, setSelectedLocalTool] = useState<
    "codex" | "claude-code" | "cursor" | null
  >(null);
  const [localRepoPath, setLocalRepoPath] = useState<string>("");
  const [parallelInstanceCount, setParallelInstanceCount] = useState<number>(4);
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [selectedGradingMethod, setSelectedGradingMethod] =
    useState<GradingMethod | null>(null);
  const [manualUrls, setManualUrls] = useState<string[]>([]);
  const [selectedGradingPrompt, setSelectedGradingPrompt] =
    useState<GradingPrompt>(getDefaultGradingPrompt());
  const [selectedCodexPrompt, setSelectedCodexPrompt] = useState<GradingPrompt>(
    getDefaultGradingPrompt()
  );
  const [selectedBatchCodexPrompt, setSelectedBatchCodexPrompt] =
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
  const [databaseFilterCriteria, setDatabaseFilterCriteria] =
    useState<FilterCriteria | null>(null);
  const [databaseProperties, setDatabaseProperties] = useState<
    DatabaseProperty[]
  >([]);
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
  const [githubIssueTitle, setGithubIssueTitle] = useState("");
  const [issueCreationResult, setIssueCreationResult] = useState<IssueCreationResults | null>(null);
  const [selectedNavOption, setSelectedNavOption] = useState(0);
  // Navigation stack to track Notion hierarchy for proper back navigation
  const [notionNavigationStack, setNotionNavigationStack] = useState<
    Array<{ pageId: string; pageTitle: string; contentType: string }>
  >([]);
  // Track if we arrived at column selection from filtered workflow (vs view workflow)
  const [isFilteredWorkflow, setIsFilteredWorkflow] = useState(false);

  // Collaborator workflow state
  const [collaboratorTargetRepo, setCollaboratorTargetRepo] = useState<{
    owner: string;
    repo: string;
    fullName: string;
  } | null>(null);
  const [collaboratorUsernames, setCollaboratorUsernames] = useState<string[]>([]);
  const [collaboratorDataSource, setCollaboratorDataSource] = useState<CollaboratorDataSource | null>(null);
  const [collaboratorResults, setCollaboratorResults] = useState<CollaboratorResults | null>(null);
  const [collaboratorCsvPath, setCollaboratorCsvPath] = useState("");
  const [collaboratorCsvAnalysis, setCollaboratorCsvAnalysis] = useState<CSVAnalysis | null>(null);
  const [collaboratorCsvInput, setCollaboratorCsvInput] = useState("");
  const [collaboratorNotionContent, setCollaboratorNotionContent] = useState<any>(null);
  const [collaboratorNotionDatabaseId, setCollaboratorNotionDatabaseId] = useState<string>("");
  const [collaboratorNotionDatabaseTitle, setCollaboratorNotionDatabaseTitle] = useState<string>("");
  const [collaboratorNotionNavigationStack, setCollaboratorNotionNavigationStack] = useState<
    Array<{ pageId: string; pageTitle: string; contentType: string }>
  >([]);

  const { exit } = useApp();

  // Helper function to navigate to a new step and optionally clear errors
  const navigateToStep = (
    newStep: Step,
    options?: { preserveError?: boolean }
  ) => {
    // Clear console when moving between major workflow steps for cleaner UX
    // But don't clear if we're preserving an error (so user can see error message)
    const majorSteps: Step[] = [
      "data-source-select",
      "notion-page-selector",
      "notion-api-content-view",
      "notion-github-column-select",
      "processing-choice",
      "notion-processing",
      "complete",
    ];

    const shouldPreserveError = options?.preserveError ?? false;

    if (majorSteps.includes(newStep) && newStep !== step && !shouldPreserveError) {
      console.clear();
    }

    if (!shouldPreserveError) {
      setError(null); // Clear any existing error messages only if not preserving
    }
    setStep(newStep);
  };

  // Load saved profile on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const prefs = await preferencesStorage.loadPreferences();
        if (prefs.activeProfile) {
          setActiveProfile(prefs.activeProfile);
          setStep("grading-mode-select");
        } else {
          setStep("profile-select");
        }
      } catch {
        setStep("profile-select");
      }
      setProfileLoaded(true);
    };
    loadProfile();
  }, []);

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

  // Handle collaborator Notion loading - just authenticate and move to page selection
  useEffect(() => {
    if (step === "collaborator-notion-loading") {
      const authenticateNotion = async () => {
        try {
          await notionOAuthClient.ensureAuthenticated();
          navigateToStep("collaborator-notion-page-select");
        } catch (err) {
          setError(
            `Failed to authenticate with Notion: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          navigateToStep("collaborator-data-source", { preserveError: true });
        }
      };

      authenticateNotion();
    }
  }, [step, notionOAuthClient]);

  // Load collaborator Notion database content when database is selected
  useEffect(() => {
    if (step === "collaborator-notion-column" && collaboratorNotionDatabaseId && !collaboratorNotionContent) {
      const loadDatabaseContent = async () => {
        try {
          const token = await notionOAuthClient.ensureAuthenticated();
          const notionService = new NotionService(token.access_token);
          const content = await notionService.queryDatabaseWithEnhancedSchema(
            collaboratorNotionDatabaseId
          );
          setCollaboratorNotionContent(content);
        } catch (err) {
          setError(
            `Failed to load database content: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
          navigateToStep("collaborator-notion-page-select", { preserveError: true });
        }
      };

      loadDatabaseContent();
    }
  }, [step, collaboratorNotionDatabaseId, collaboratorNotionContent, notionOAuthClient]);

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

        const rateLimiter = selectedProvider
          ? new RateLimiter(selectedProvider)
          : undefined;

        if (useGitHubAPI) {
          githubService = new GitHubService(githubToken, undefined, maxDepth);
        } else {
          try {
            const { SandboxService } = await import("./lib/sandbox/index.js");
            sandboxService = new SandboxService();
            await sandboxService.initialize();
            console.log(
              ` Using sandbox for processing ${notionGitHubUrls.length} repositories`
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
              ` Processing ${notionGitHubUrls.length} repositories in parallel batches of ${SANDBOX_BATCH_SIZE}`
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
                `\n Processing batch ${batchNumber}/${totalBatches} (${batch.length} repositories)`
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
                    selectedGradingPrompt.value,
                    rateLimiter
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
                      selectedGradingPrompt.value,
                      rateLimiter
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
      // Only initialize tokens when we reach the github-token step
      // This prevents auto-navigation on initial mount
      if (step !== "github-token") return;

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
            // Stay on github-token step if validation fails
          }
        } catch (error) {
          setTokenValid(false);
          // Stay on github-token step if validation fails
        } finally {
          setValidatingToken(false);
        }
      }
    };

    initializeToken();
  }, [step, tokenStorage, preferencesStorage]);

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
            const token = await notionOAuthClient.ensureAuthenticated();

            // Validate the token with a test API call
            const { NotionService } = await import(
              "./lib/notion/notion-service.js"
            );
            const service = new NotionService(token.access_token);
            const validation = await service.validateToken();

            if (validation.valid) {
              console.clear();
              navigateToStep("notion-page-selector");
            } else {
              // Clear the invalid token and re-authenticate
              storage.clearToken();

              // Automatically start OAuth without user intervention
              try {
                const token = await notionOAuthClient.ensureAuthenticated();
                const service = new NotionService(token.access_token);
                const revalidation = await service.validateToken();

                if (revalidation.valid) {
                  console.clear();
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
            // Auto-trigger OAuth for authentication errors
            if (
              e.message?.includes("API token is invalid") ||
              e.message?.includes("unauthorized")
            ) {
              // Clear the invalid token
              storage.clearToken();

              // Automatically start OAuth without user intervention
              try {
                const token = await notionOAuthClient.ensureAuthenticated();
                const service = new NotionService(token.access_token);
                const revalidation = await service.validateToken();

                if (revalidation.valid) {
                  console.clear();
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
            const token = await notionOAuthClient.ensureAuthenticated();

            // Validate the new token
            const { NotionService } = await import(
              "./lib/notion/notion-service.js"
            );
            const service = new NotionService(token.access_token);
            const validation = await service.validateToken();

            if (validation.valid) {
              console.clear();
              navigateToStep("notion-page-selector");
            } else {
              throw new Error(
                validation.error ||
                  "Token validation failed after authentication"
              );
            }
          } catch (e: any) {
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
              navigateToStep("data-source-select", { preserveError: true });
            }
          } else {
            setError(
              `Notion authentication failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            setNotionNavigationStack([]);
            navigateToStep("data-source-select", { preserveError: true });
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
              ` Saved ${result.success} entries, ${result.failed} failed`
            );
          } else {
            console.log(
              ` Successfully saved ${result.success} grading results to Notion database`
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
          "https://github.com/settings/tokens/new?description=cli-agents-fleet&scopes=public_repo"
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
          setManualUrls(urls);
          navigateToStep("grading-method-select");
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          navigateToStep("select");
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

        // Navigate to processing choice
        navigateToStep("processing-choice");
      } else if (key.escape) {
        // Go back to provider selection
        navigateToStep("provider-select");
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
      } else if (key.escape) {
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
          navigateToStep("grading-save-options");
        } else if (selectedNavOption === 1) {
          navigateToStep("notion-page-selector");
        } else if (selectedNavOption === 2) {
          navigateToStep("complete");
        }
      }
    } else if (step === "github-issue-complete") {
      if (key.upArrow && selectedNavOption > 0) {
        setSelectedNavOption(selectedNavOption - 1);
      } else if (key.downArrow && selectedNavOption < 1) {
        setSelectedNavOption(selectedNavOption + 1);
      } else if (key.return) {
        if (selectedNavOption === 0) {
          navigateToStep("grading-save-options");
        } else if (selectedNavOption === 1) {
          navigateToStep("complete");
        }
      }
    } else if (step === "collaborator-csv-input") {
      if (key.return && collaboratorCsvInput.trim()) {
        const csvPath = collaboratorCsvInput.trim();
        if (!fs.existsSync(csvPath)) {
          setError("File not found: " + csvPath);
          return;
        }
        try {
          const csvAnalysis = await validateAndAnalyzeCSV(csvPath);
          setCollaboratorCsvAnalysis(csvAnalysis);
          setCollaboratorCsvPath(csvPath);
          setError(null);
          navigateToStep("collaborator-csv-column-select");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to analyze CSV");
        }
      } else if (key.backspace || key.delete) {
        setCollaboratorCsvInput((prev) => prev.slice(0, -1));
        setError(null);
      } else if (key.escape && !collaboratorCsvInput) {
        navigateToStep("collaborator-data-source");
      } else if (
        inputChar &&
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return
      ) {
        setCollaboratorCsvInput((prev) => prev + inputChar);
        setError(null);
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
        navigateToStep("complete");
      } else if (option === "github-issue") {
        navigateToStep("github-issue-title-input");
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
  if (step === "profile-select") {
    if (!profileLoaded) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Loading...</Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="column">
        <ProfileSelector
          onSelect={async (profile) => {
            setActiveProfile(profile);
            await preferencesStorage.savePreferences({ activeProfile: profile });
            navigateToStep("grading-mode-select");
          }}
        />
      </Box>
    );
  }

  if (step === "grading-mode-select") {
    return (
      <Box flexDirection="column">
        <GradingModeSelector
          onSelect={(mode) => {
            setSelectedGradingMode(mode);
            if (mode === "local") {
              navigateToStep("local-tool-select");
            } else if (mode === "batch") {
              navigateToStep("data-source-select");
            } else if (mode === "collaborator") {
              // Check if we already have a valid GitHub token
              const storedToken = tokenStorage.getToken();
              if (storedToken) {
                setGithubToken(storedToken);
                navigateToStep("collaborator-repo-search");
              } else {
                navigateToStep("collaborator-github-auth");
              }
            }
          }}
          activeProfile={activeProfile ?? undefined}
          onSwitchProfile={() => navigateToStep("profile-select")}
        />
      </Box>
    );
  }

  if (step === "parallel-instance-select") {
    return (
      <Box flexDirection="column">
        <ParallelInstanceSelector
          onSubmit={(count) => {
            setParallelInstanceCount(count);
            navigateToStep("batch-codex-prompt-select");
          }}
          onBack={() => {
            navigateToStep("grading-method-select");
          }}
        />
      </Box>
    );
  }

  if (step === "batch-codex-prompt-select") {
    return (
      <Box flexDirection="column">
        <PromptSelector
          onSelect={(prompt) => {
            setSelectedBatchCodexPrompt(prompt);
            navigateToStep("parallel-codex-test");
          }}
          onBack={() => {
            navigateToStep("parallel-instance-select");
          }}
        />
      </Box>
    );
  }

  if (step === "parallel-codex-test") {
    const urlsToProcess =
      selectedDataSource === "notion"
        ? notionGitHubUrls.map((item) => item.url)
        : manualUrls;

    // Pass urlsWithPageIds only for Notion workflows to enable row updates
    const urlsWithPageIds =
      selectedDataSource === "notion" ? notionGitHubUrls : null;

    return (
      <Box flexDirection="column">
        <ParallelCodexBatch
          urls={urlsToProcess}
          instanceCount={parallelInstanceCount}
          urlsWithPageIds={urlsWithPageIds}
          selectedPrompt={selectedBatchCodexPrompt}
          githubToken={githubToken}
          onComplete={(results) => {}}
          onBack={() => {
            navigateToStep("batch-codex-prompt-select");
          }}
        />
      </Box>
    );
  }

  if (step === "local-tool-select") {
    return (
      <Box flexDirection="column">
        <LocalToolSelector
          onSelect={(tool) => {
            setSelectedLocalTool(tool);
            if (tool === "codex") {
              navigateToStep("local-repo-path-input");
            }
          }}
          onBack={() => {
            navigateToStep("grading-mode-select");
          }}
        />
      </Box>
    );
  }

  if (step === "local-repo-path-input") {
    return (
      <Box flexDirection="column">
        <LocalRepoPathInput
          onSubmit={(repoPath) => {
            setLocalRepoPath(repoPath);
            navigateToStep("codex-prompt-select");
          }}
          onBack={() => {
            navigateToStep("local-tool-select");
          }}
          currentDirectory={process.cwd()}
        />
      </Box>
    );
  }

  if (step === "codex-prompt-select") {
    return (
      <Box flexDirection="column">
        <PromptSelector
          onSelect={(prompt) => {
            setSelectedCodexPrompt(prompt);
            navigateToStep("codex-starting");
          }}
          onBack={() => navigateToStep("local-repo-path-input")}
        />
      </Box>
    );
  }

  if (step === "codex-starting") {
    return (
      <Box flexDirection="column">
        <CodexStarting
          repoPath={localRepoPath}
          selectedPrompt={selectedCodexPrompt}
        />
      </Box>
    );
  }

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

  if (step === "workflow-mode-select") {
    return (
      <Box flexDirection="column">
        <WorkflowModeSelector
          onSelect={(mode) => {
            setSelectedWorkflowMode(mode);
            if (mode === "llm") {
              navigateToStep("provider-select");
            } else if (mode === "codex") {
              navigateToStep("codex-menu");
            }
          }}
          onBack={() => {
            navigateToStep("e2b-api-key");
          }}
        />
      </Box>
    );
  }

  if (step === "codex-menu") {
    return (
      <Box flexDirection="column">
        <CodexMenuSelector
          onSelect={(option) => {
            if (option === "choose-database") {
              navigateToStep("data-source-select");
            } else if (option === "run-test") {
              setError("Run test functionality is not yet implemented.");
            }
          }}
          onBack={() => {
            navigateToStep("workflow-mode-select");
          }}
        />
      </Box>
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
          onBack={() => {
            navigateToStep("e2b-api-key");
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
        <Text
          color={selectedChunkingOption === 0 ? "green" : "white"}
          bold={selectedChunkingOption === 0}
        >
          Process with chunking
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
          Skip large repositories{" "}
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
            } else if (source === "manual") {
              navigateToStep("manual-url-input");
            }
          }}
          onBack={() => {
            // Go back to grading mode selection
            navigateToStep("grading-mode-select");
          }}
        />
      </Box>
    );
  }

  if (step === "manual-url-input") {
    return (
      <Box flexDirection="column">
        <ManualUrlInput
          onComplete={(urls) => {
            setManualUrls(urls);
            navigateToStep("grading-method-select");
          }}
          onBack={() => {
            navigateToStep("data-source-select");
          }}
        />
      </Box>
    );
  }

  if (step === "grading-method-select") {
    return (
      <Box flexDirection="column">
        <GradingMethodSelector
          onSelect={(method) => {
            setSelectedGradingMethod(method);
            if (method === "sandbox-llm") {
              navigateToStep("github-token");
            } else if (method === "codex-local") {
              navigateToStep("parallel-instance-select");
            }
          }}
          onBack={() => {
            // Go back to appropriate step based on data source
            if (selectedDataSource === "manual") {
              navigateToStep("manual-url-input");
            } else if (selectedDataSource === "csv") {
              navigateToStep("select");
            } else if (selectedDataSource === "notion") {
              navigateToStep("notion-github-column-select");
            } else {
              navigateToStep("data-source-select");
            }
          }}
        />
        {error && (
          <>
            <Text></Text>
            <Text color="yellow">{error}</Text>
          </>
        )}
      </Box>
    );
  }

  if (step === "notion-oauth-info") {
    return (
      <Box flexDirection="column">
        {error && (
          <>
            <Text color="red"> {error}</Text>
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
        <Text></Text>
        <Text dimColor>Authorization URL:</Text>
        <Text dimColor wrap="wrap">
          {oauthUrl}
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
        {notionProperties.map((property, index) => {
          const isSelected = index === selectedNotionProperty;
          return (
            <Box key={index}>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
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
      : " No token (60 requests/hour limit)";
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
        <Text></Text>
        {analysis.columns.map((column, index) => {
          const isSelected = index === selectedColumn;
          const isSuggested =
            analysis.suggestedGitHubColumn?.name === column.name;

          return (
            <Box key={index} flexDirection="column">
              <Box>
                <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
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
              const dbProperties = await notionService.getDatabaseProperties(
                pageId
              );
              const filterableProps: DatabaseProperty[] = Object.entries(
                dbProperties
              )
                .filter(([_, prop]) =>
                  [
                    "select",
                    "multi_select",
                    "rich_text",
                    "title",
                    "checkbox",
                    "number",
                  ].includes(prop.type)
                )
                .map(([name, prop]) => ({
                  name,
                  type: prop.type,
                  options:
                    (prop as any).select?.options ||
                    (prop as any).multi_select?.options,
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
            // Clear error, cached data, and trigger automatic OAuth re-authentication
            setError(null);
            setCachedNotionPages([]);
            setCachedNotionDatabases([]);
            console.log(
              "🔄 Authentication required, triggering automatic OAuth flow..."
            );
            navigateToStep("notion-auth-loading");
          }}
          onError={(error) => {
            setError(error);
            setNotionNavigationStack([]);
            navigateToStep("data-source-select", { preserveError: true });
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
            setNotionNavigationStack((prev) => [
              ...prev,
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
              const dbProperties = await notionService.getDatabaseProperties(
                pageId
              );
              const filterableProps: DatabaseProperty[] = Object.entries(
                dbProperties
              )
                .filter(([_, prop]) =>
                  [
                    "select",
                    "multi_select",
                    "rich_text",
                    "title",
                    "checkbox",
                    "number",
                  ].includes(prop.type)
                )
                .map(([name, prop]) => ({
                  name,
                  type: prop.type,
                  options:
                    (prop as any).select?.options ||
                    (prop as any).multi_select?.options,
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
            console.log(
              "Re-authentication required, triggering OAuth flow..."
            );
            navigateToStep("notion-auth-loading");
          }}
          onBack={() => {
            // Pop from navigation stack if not empty, otherwise return to page selector
            setNotionNavigationStack((prev) => {
              if (prev.length > 0) {
                const previousPage = prev[prev.length - 1];
                setNotionApiSelectedPageId(previousPage.pageId);
                setNotionApiSelectedPageTitle(previousPage.pageTitle);
                setNotionApiContentType(previousPage.contentType);
                return prev.slice(0, -1);
              } else {
                navigateToStep("notion-page-selector");
                return prev;
              }
            });
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
        message={
          databaseFilterCriteria
            ? "Applying filters and loading entries..."
            : "Loading all database entries..."
        }
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
        ? (databaseFilterCriteria.value as string[]).join(", ")
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
        <Text> Property: {databaseFilterCriteria?.propertyName || "None"}</Text>
        <Text> Type: {databaseFilterCriteria?.filterType || "N/A"}</Text>
        {filterValue && <Text> Value: {filterValue}</Text>}
        <Text></Text>
        <Text color="gray" dimColor>
          {rowCount === 0
            ? "  No rows match the filter criteria. Please adjust your filter or go back."
            : rowCount === 1
            ? "1 row will be processed for grading."
            : `${rowCount} rows will be processed for grading.`}
        </Text>
        <Text></Text>
        <Box>
          <Text
            color={selectedNavOption === 0 ? "cyan" : "white"}
            bold={selectedNavOption === 0}
          >
            Continue to Column Selection
          </Text>
        </Box>
        <Box>
          <Text
            color={selectedNavOption === 1 ? "cyan" : "white"}
            bold={selectedNavOption === 1}
          >
            Back to Filter
          </Text>
        </Box>
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
                  " Received string URLs without pageIds - new entries will be created"
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
                urlsWithIds = urlObjects;
              }
            }

            setNotionGitHubUrls(urlsWithIds);
            setSelectedGitHubColumn(
              selectedProperty.name || selectedProperty.propertyName || ""
            );
            navigateToStep("grading-method-select");
          }}
          onError={(error) => {
            // Don't use navigateToStep since it clears errors
            // Set step first, then set error so it persists
            setStep(
              isFilteredWorkflow
                ? "notion-filter-confirmation"
                : "notion-api-content-view"
            );
            setError(error);
          }}
          onBack={() => {
            // Navigate back based on workflow path
            navigateToStep(
              isFilteredWorkflow
                ? "notion-filter-confirmation"
                : "notion-api-content-view"
            );
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

  if (step === "github-issue-title-input") {
    const repoCount = gradingResults.filter((r) => r.githubUrl && !r.error).length;
    return (
      <GitHubIssueTitleInput
        repoCount={repoCount}
        onSubmit={(title) => {
          setGithubIssueTitle(title);
          navigateToStep("github-issue-creation");
        }}
        onBack={() => navigateToStep("grading-save-options")}
      />
    );
  }

  if (step === "github-issue-creation") {
    return (
      <GitHubIssueCreationProgress
        gradingResults={gradingResults}
        issueTitle={githubIssueTitle}
        githubToken={githubToken || ""}
        onComplete={(results) => {
          setIssueCreationResult(results);
          navigateToStep("github-issue-complete");
        }}
      />
    );
  }

  if (step === "github-issue-complete") {
    const created = issueCreationResult?.created.length || 0;
    const skipped = issueCreationResult?.skipped.length || 0;
    const failed = issueCreationResult?.failed.length || 0;

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green" bold>
          GitHub Issues Created!
        </Text>
        <Text></Text>
        <Text>
          <Text color="green">{created} created</Text>
          {skipped > 0 && <Text color="yellow">, {skipped} skipped (no access)</Text>}
          {failed > 0 && <Text color="red">, {failed} failed</Text>}
        </Text>
        <Text></Text>
        {issueCreationResult?.created.slice(0, 5).map((item) => (
          <Text key={item.repoName} dimColor>
            {item.repoName}: {item.issueUrl}
          </Text>
        ))}
        {(issueCreationResult?.created.length || 0) > 5 && (
          <Text dimColor>...and {(issueCreationResult?.created.length || 0) - 5} more</Text>
        )}
        <Text></Text>
        <Text color={selectedNavOption === 0 ? "cyan" : "white"} bold={selectedNavOption === 0}>
          Back to Save Options
        </Text>
        <Text color={selectedNavOption === 1 ? "cyan" : "white"} bold={selectedNavOption === 1}>
          Exit
        </Text>
        <Text></Text>
      </Box>
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
             Notion Save Complete!
          </Text>
        ) : (
          <Text color="red" bold>
             Notion Save Failed
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

        <Text color={selectedNavOption === 0 ? "cyan" : "white"} bold={selectedNavOption === 0}>
          Back to Save Options
        </Text>
        <Text color={selectedNavOption === 1 ? "cyan" : "white"} bold={selectedNavOption === 1}>
          Choose Different Database
        </Text>
        <Text color={selectedNavOption === 2 ? "cyan" : "white"} bold={selectedNavOption === 2}>
          Exit
        </Text>

        <Text></Text>
      </Box>
    );
  }

  if (step === "processing-choice") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
           Choose Processing Type
        </Text>
        <Text></Text>
        <Text>
          Found {notionGitHubUrls.length} GitHub repositories. What would you
          like to do?
        </Text>
        <Text></Text>
        <Text
          color={selectedProcessingOption === 0 ? "blue" : "white"}
          bold={selectedProcessingOption === 0}
        >
          Grade repository code only {selectedProcessingOption === 0 ? "(recommended)" : ""}
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
          Test deployed applications only
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
          Do both
        </Text>
        <Text dimColor>
          {" "}
          • Clone and grade code THEN test deployed applications
        </Text>
        <Text dimColor> • Comprehensive analysis with complete results</Text>
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
                  " Received deployed URLs without pageIds - new entries will be created"
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

  // ================== COLLABORATOR WORKFLOW STEPS ==================

  if (step === "collaborator-github-auth") {
    return (
      <GitHubAuthInput
        title="GitHub Authentication Required"
        description="To add collaborators to a repository, you need to authenticate with GitHub."
        scope="repo"
        existingToken={githubToken}
        onAuthenticated={(token) => {
          setGithubToken(token);
          setTokenValid(true);
          setError(null);
          navigateToStep("collaborator-repo-search");
        }}
        onBack={() => navigateToStep("grading-mode-select")}
      />
    );
  }

  if (step === "collaborator-repo-search" && githubToken) {
    return (
      <Box flexDirection="column">
        <GitHubRepoSearchSelector
          githubToken={githubToken}
          onSelect={(repo) => {
            setCollaboratorTargetRepo(repo);
            navigateToStep("collaborator-data-source");
          }}
          onBack={() => {
            navigateToStep("grading-mode-select");
          }}
          onLogout={() => {
            setGithubToken(undefined);
            navigateToStep("collaborator-github-auth");
          }}
          onError={(err) => {
            setError(err);
            navigateToStep("collaborator-github-auth", { preserveError: true });
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-data-source" && collaboratorTargetRepo) {
    return (
      <Box flexDirection="column">
        <CollaboratorDataSourceSelector
          targetRepo={collaboratorTargetRepo.fullName}
          onSelect={(source) => {
            setCollaboratorDataSource(source);
            if (source === "manual") {
              navigateToStep("collaborator-manual-input");
            } else if (source === "csv") {
              setCollaboratorCsvInput("");
              navigateToStep("collaborator-csv-input");
            } else if (source === "notion") {
              navigateToStep("collaborator-notion-loading");
            }
          }}
          onBack={() => {
            navigateToStep("collaborator-repo-search");
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-manual-input" && collaboratorTargetRepo) {
    return (
      <Box flexDirection="column">
        <CollaboratorUsernameInput
          targetRepo={collaboratorTargetRepo.fullName}
          onComplete={(usernames) => {
            setCollaboratorUsernames(usernames);
            navigateToStep("collaborator-confirm");
          }}
          onBack={() => {
            navigateToStep("collaborator-data-source");
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-csv-input" && collaboratorTargetRepo) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Enter CSV File Path
        </Text>
        <Text dimColor>Adding collaborators to: {collaboratorTargetRepo.fullName}</Text>
        <Text></Text>
        <Box
          borderStyle="single"
          borderColor={error ? "red" : "blue"}
          paddingX={1}
        >
          <Text>{collaboratorCsvInput}</Text>
          <Text color="blue">█</Text>
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">{error}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (step === "collaborator-csv-column-select" && collaboratorCsvAnalysis && collaboratorTargetRepo) {
    return (
      <Box flexDirection="column">
        <CollaboratorCsvColumnSelector
          analysis={collaboratorCsvAnalysis}
          targetRepo={collaboratorTargetRepo.fullName}
          onSelect={(usernames) => {
            setCollaboratorUsernames(usernames);
            navigateToStep("collaborator-confirm");
          }}
          onBack={() => {
            navigateToStep("collaborator-csv-input");
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-notion-loading") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Loading Notion Data
        </Text>
        <Text></Text>
        <Text color="cyan">Connecting to Notion...</Text>
      </Box>
    );
  }

  if (step === "collaborator-notion-page-select") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Select Database for GitHub Usernames
        </Text>
        <Text dimColor>Adding collaborators to: {collaboratorTargetRepo?.fullName}</Text>
        <Text></Text>
        <NotionPageSelector
          onSelect={(pageId, pageTitle, type) => {
            setCollaboratorNotionNavigationStack([]);
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(type);
            navigateToStep("collaborator-notion-content-view");
          }}
          onSelectForCollaborator={(pageId, pageTitle) => {
            setCollaboratorNotionDatabaseId(pageId);
            setCollaboratorNotionDatabaseTitle(pageTitle);
            setCollaboratorNotionContent(null);
            navigateToStep("collaborator-notion-column");
          }}
          onError={(err) => {
            setError(err);
          }}
          onBack={() => {
            navigateToStep("collaborator-data-source");
          }}
          cachedPages={cachedNotionPages}
          cachedDatabases={cachedNotionDatabases}
          onDataLoaded={(pages, databases) => {
            setCachedNotionPages(pages);
            setCachedNotionDatabases(databases);
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-notion-content-view") {
    return (
      <Box flexDirection="column">
        <NotionContentViewer
          pageId={notionApiSelectedPageId}
          pageTitle={notionApiSelectedPageTitle}
          contentType={notionApiContentType}
          onComplete={() => {}}
          onNavigate={(pageId, pageTitle, contentType) => {
            setCollaboratorNotionNavigationStack([
              ...collaboratorNotionNavigationStack,
              {
                pageId: notionApiSelectedPageId,
                pageTitle: notionApiSelectedPageTitle,
                contentType: notionApiContentType,
              },
            ]);
            setNotionApiSelectedPageId(pageId);
            setNotionApiSelectedPageTitle(pageTitle);
            setNotionApiContentType(contentType || "page");
          }}
          onSelectForCollaborator={(pageId, pageTitle) => {
            setCollaboratorNotionDatabaseId(pageId);
            setCollaboratorNotionDatabaseTitle(pageTitle);
            setCollaboratorNotionContent(null);
            navigateToStep("collaborator-notion-column");
          }}
          onAuthenticationRequired={() => {
            console.log(
              "Re-authentication required, triggering OAuth flow..."
            );
            navigateToStep("notion-auth-loading");
          }}
          onBack={() => {
            if (collaboratorNotionNavigationStack.length > 0) {
              const prev = collaboratorNotionNavigationStack[collaboratorNotionNavigationStack.length - 1];
              setCollaboratorNotionNavigationStack(collaboratorNotionNavigationStack.slice(0, -1));
              setNotionApiSelectedPageId(prev.pageId);
              setNotionApiSelectedPageTitle(prev.pageTitle);
              setNotionApiContentType(prev.contentType);
            } else {
              navigateToStep("collaborator-notion-page-select");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-notion-column" && collaboratorTargetRepo) {
    if (!collaboratorNotionContent) {
      return (
        <Box flexDirection="column">
          <Text color="blue" bold>
            Loading Database Content
          </Text>
          <Text></Text>
          <Text color="cyan">Fetching {collaboratorNotionDatabaseTitle}...</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column">
        <CollaboratorNotionColumnSelector
          notionContent={collaboratorNotionContent}
          targetRepo={collaboratorTargetRepo.fullName}
          onSelect={(usernames) => {
            setCollaboratorUsernames(usernames);
            navigateToStep("collaborator-confirm");
          }}
          onBack={() => {
            setCollaboratorNotionContent(null);
            navigateToStep("collaborator-notion-page-select");
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-confirm" && collaboratorTargetRepo && collaboratorUsernames.length > 0) {
    return (
      <Box flexDirection="column">
        <CollaboratorConfirm
          targetRepo={collaboratorTargetRepo.fullName}
          usernames={collaboratorUsernames}
          onConfirm={() => {
            const uniqueUsernames = [...new Set(collaboratorUsernames.map((u) => u.trim().toLowerCase()))];
            setCollaboratorUsernames(uniqueUsernames);
            navigateToStep("collaborator-adding");
          }}
          onBack={() => {
            setCollaboratorUsernames([]);
            if (collaboratorDataSource === "manual") {
              navigateToStep("collaborator-manual-input");
            } else if (collaboratorDataSource === "csv") {
              navigateToStep("collaborator-csv-column-select");
            } else if (collaboratorDataSource === "notion") {
              navigateToStep("collaborator-notion-column");
            } else {
              navigateToStep("collaborator-data-source");
            }
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-adding" && collaboratorTargetRepo && collaboratorUsernames.length > 0 && githubToken) {
    return (
      <Box flexDirection="column">
        <CollaboratorAddProgress
          targetRepo={collaboratorTargetRepo}
          usernames={collaboratorUsernames}
          githubToken={githubToken}
          onComplete={(results) => {
            setCollaboratorResults(results);
            navigateToStep("collaborator-summary");
          }}
        />
      </Box>
    );
  }

  if (step === "collaborator-summary" && collaboratorTargetRepo && collaboratorResults) {
    return (
      <Box flexDirection="column">
        <CollaboratorAddSummary
          targetRepo={collaboratorTargetRepo}
          results={collaboratorResults}
          onRetryFailed={(failedUsernames) => {
            setCollaboratorUsernames(failedUsernames);
            setCollaboratorResults(null);
            navigateToStep("collaborator-confirm");
          }}
          onAddMore={() => {
            setCollaboratorUsernames([]);
            setCollaboratorResults(null);
            navigateToStep("collaborator-data-source");
          }}
          onNewRepo={() => {
            setCollaboratorTargetRepo(null);
            setCollaboratorUsernames([]);
            setCollaboratorResults(null);
            navigateToStep("collaborator-repo-search");
          }}
          onBackToMenu={() => {
            setCollaboratorTargetRepo(null);
            setCollaboratorUsernames([]);
            setCollaboratorResults(null);
            setCollaboratorDataSource(null);
            navigateToStep("grading-mode-select");
          }}
        />
      </Box>
    );
  }

  return null;
};
