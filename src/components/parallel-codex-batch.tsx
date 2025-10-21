import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput } from "ink";
import { ParallelCodexService, RepoEventData } from "../lib/codex/parallel-codex-service.js";
import {
  ParallelGradingResult,
  ParallelTestResults,
  ThreadItem,
} from "../lib/codex/codex-types.js";
import { getDefaultGradingPrompt } from "../consts/grading-prompts.js";
import { NotionSavePrompt } from "./notion-save-prompt.js";
import { NotionDatabaseSelector } from "./notion-database-selector.js";
import { GradingDatabaseService } from "../lib/notion/grading-database-service.js";
import type { GradingResult } from "../lib/file-saver.js";

interface ParallelCodexBatchProps {
  urls: string[];
  instanceCount: number;
  urlsWithPageIds?: Array<{url: string, pageId: string}> | null; // For Notion workflows - match URLs to existing rows
  onComplete?: (results: ParallelTestResults) => void;
  onBack?: () => void;
}

type Phase = "cloning" | "grading" | "completed" | "notion-prompt" | "notion-db-select" | "notion-saving";

interface RepoStatus {
  owner: string;
  repo: string;
  status: "pending" | "cloning" | "cloned" | "initializing" | "analyzing" | "streaming" | "cancelling" | "completed" | "error";
  error?: string;
  failureType?: "clone" | "grading";
  isTimeout?: boolean;
  duration?: number;
  feedback?: string;
  currentActivity?: string;
  streamingMessage?: string;
  itemCount?: number;
  tokensUsed?: {
    input: number;
    cached: number;
    output: number;
    total: number;
  };
}

const getActivityMessage = (item: ThreadItem): string => {
  switch (item.type) {
    case "reasoning":
      return "💭 Analyzing code...";
    case "command_execution":
      return `$ Running: ${(item as any).command || 'command'}`;
    case "file_change":
      return "📝 Reading files...";
    case "agent_message":
      return "💬 Generating feedback...";
    case "todo_list":
      return "📋 Planning tasks...";
    default:
      return "⚙️ Processing...";
  }
};

export const ParallelCodexBatch: React.FC<ParallelCodexBatchProps> = ({
  urls,
  instanceCount,
  urlsWithPageIds,
  onComplete,
  onBack,
}) => {
  const [phase, setPhase] = useState<Phase>("cloning");
  const [repoStatuses, setRepoStatuses] = useState<RepoStatus[]>(() => {
    return urls.map((url) => {
      const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      return {
        owner: match?.[1] || "",
        repo: match?.[2]?.replace(/\.git$/, "") || "",
        status: "pending" as const,
      };
    });
  });
  const [cloningProgress, setCloningProgress] = useState<{
    current: number;
    total: number;
    message: string;
  }>({ current: 0, total: urls.length, message: "" });
  const [gradingProgress, setGradingProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });
  const [results, setResults] = useState<ParallelTestResults | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [isAborting, setIsAborting] = useState(false);
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [cancellingRepos, setCancellingRepos] = useState<Map<string, 'skip' | 'stop'>>(new Map());
  const serviceRef = useRef<ParallelCodexService | null>(null);
  const [notionSaveStatus, setNotionSaveStatus] = useState<{
    saving: boolean;
    success: number;
    failed: number;
    errors: string[];
  }>({ saving: false, success: 0, failed: 0, errors: [] });

  const VIEWPORT_SIZE = 7;

  const spinnerFrames = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (phase !== 'grading' || isAborting) {
      return;
    }

    if (key.upArrow) {
      setSelectedRowIndex((prev) => {
        const newIndex = Math.max(0, prev - 1);
        // Auto-scroll up if selection goes above viewport
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key.downArrow) {
      setSelectedRowIndex((prev) => {
        const newIndex = Math.min(repoStatuses.length - 1, prev + 1);
        // Auto-scroll down if selection goes below viewport
        if (newIndex >= scrollOffset + VIEWPORT_SIZE) {
          setScrollOffset(newIndex - VIEWPORT_SIZE + 1);
        }
        return newIndex;
      });
    } else if (input === 's' && serviceRef.current) {
      const selectedRepo = repoStatuses[selectedRowIndex];
      if (selectedRepo && !['completed', 'error', 'cancelling'].includes(selectedRepo.status)) {
        setRepoStatuses((prev) =>
          prev.map((repo) =>
            repo.owner === selectedRepo.owner && repo.repo === selectedRepo.repo
              ? { ...repo, status: "cancelling", currentActivity: "⏭️ Skipping..." }
              : repo
          )
        );
        setCancellingRepos((prev) => new Map(prev).set(`${selectedRepo.owner}/${selectedRepo.repo}`, 'skip'));
        serviceRef.current.skipRepo(selectedRepo.owner, selectedRepo.repo);
      }
    } else if (input === 'x' && serviceRef.current) {
      const selectedRepo = repoStatuses[selectedRowIndex];
      if (selectedRepo && !['completed', 'error', 'cancelling'].includes(selectedRepo.status)) {
        setRepoStatuses((prev) =>
          prev.map((repo) =>
            repo.owner === selectedRepo.owner && repo.repo === selectedRepo.repo
              ? { ...repo, status: "cancelling", currentActivity: "🛑 Stopping..." }
              : repo
          )
        );
        setCancellingRepos((prev) => new Map(prev).set(`${selectedRepo.owner}/${selectedRepo.repo}`, 'stop'));
        serviceRef.current.stopRepo(selectedRepo.owner, selectedRepo.repo);
      }
    } else if (input === 'a' && serviceRef.current) {
      setIsAborting(true);
      serviceRef.current.abort();
    }
  });

  useEffect(() => {
    const runBatch = async () => {
      const service = new ParallelCodexService(urls);
      serviceRef.current = service;

      const cloneResults = await service.cloneRepositories(
        (message, current, total) => {
          setCloningProgress({ current, total, message });
          setRepoStatuses((prev) =>
            prev.map((repo, idx) => {
              if (idx < current - 1) {
                return { ...repo, status: "cloned", currentActivity: undefined };
              } else if (idx === current - 1) {
                return { ...repo, status: "cloning", currentActivity: "🔄 Cloning repository..." };
              }
              return repo;
            })
          );
        }
      );

      setRepoStatuses((prev) =>
        prev.map((repo) => {
          const cloneFailure = cloneResults.failed.find(
            (f) => f.owner === repo.owner && f.repo === repo.repo
          );
          if (cloneFailure) {
            return {
              ...repo,
              status: "error" as const,
              error: cloneFailure.error,
              failureType: "clone" as const,
              currentActivity: undefined,
            };
          }
          const wasCloned = cloneResults.successful.find(
            (c) => c.owner === repo.owner && c.repo === repo.repo
          );
          if (wasCloned) {
            return { ...repo, status: "pending" as const };
          }
          return repo;
        })
      );

      if (cloneResults.successful.length > 0) {
        setPhase("grading");
        setGradingProgress({ completed: 0, total: cloneResults.successful.length });

        const defaultPrompt = getDefaultGradingPrompt();

        const batchResults = await service.runParallelGrading(
          defaultPrompt.value,
          (repoInfo) => {
            setRepoStatuses((prev) =>
              prev.map((repo) =>
                repo.owner === repoInfo.owner && repo.repo === repoInfo.repo
                  ? { ...repo, status: "initializing" }
                  : repo
              )
            );
          },
          (result: ParallelGradingResult) => {
            setGradingProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
            const isTimeout = result.error?.toLowerCase().includes('timeout') ?? false;
            setRepoStatuses((prev) =>
              prev.map((repo) =>
                repo.owner === result.repoInfo.owner &&
                repo.repo === result.repoInfo.repo
                  ? {
                      ...repo,
                      status: result.success ? "completed" : "error",
                      error: result.error,
                      failureType: result.success ? undefined : ("grading" as const),
                      isTimeout: isTimeout,
                      duration: result.duration,
                      feedback: result.feedback,
                      tokensUsed: result.tokensUsed,
                      currentActivity: undefined,
                      streamingMessage: undefined,
                    }
                  : repo
              )
            );
          },
          (repoInfo, event: RepoEventData) => {
            setRepoStatuses((prev) =>
              prev.map((repo) => {
                if (repo.owner === repoInfo.owner && repo.repo === repoInfo.repo) {
                  switch (event.type) {
                    case 'initializing':
                      return {
                        ...repo,
                        status: 'initializing',
                        currentActivity: '⚙️ Initializing Codex...',
                        itemCount: 0
                      };
                    case 'item_updated':
                      if (event.data && event.data.type === 'agent_message') {
                        return {
                          ...repo,
                          status: 'streaming',
                          streamingMessage: event.data.text || '',
                          currentActivity: '💬 Streaming response...'
                        };
                      }
                      return repo;
                    case 'item_completed':
                      if (event.data) {
                        if (event.data.type === 'reasoning') {
                          return {
                            ...repo,
                            itemCount: (repo.itemCount || 0) + 1
                          };
                        }
                        const activityMessage = getActivityMessage(event.data);
                        return {
                          ...repo,
                          status: 'analyzing',
                          currentActivity: activityMessage,
                          streamingMessage: undefined,
                          itemCount: (repo.itemCount || 0) + 1
                        };
                      }
                      return repo;
                    case 'turn_completed':
                      return repo;
                    case 'error':
                      const repoKey = `${repo.owner}/${repo.repo}`;
                      const wasSkipped = cancellingRepos.get(repoKey) === 'skip';
                      const wasStopped = cancellingRepos.get(repoKey) === 'stop';
                      const errorMessage = wasSkipped ? 'Skipped by user' :
                                          wasStopped ? 'Stopped by user' :
                                          event.data;
                      return {
                        ...repo,
                        status: 'error',
                        error: errorMessage,
                        failureType: 'grading',
                        currentActivity: undefined,
                        streamingMessage: undefined,
                      };
                    default:
                      return repo;
                  }
                }
                return repo;
              })
            );
          }
        );

        setResults(batchResults);

        // Show Notion save prompt if there are successful gradings
        if (batchResults.successCount > 0) {
          setPhase("notion-prompt");
        } else {
          setPhase("completed");
          if (onComplete) {
            onComplete(batchResults);
          }
        }
      } else {
        const emptyResults: ParallelTestResults = {
          results: [],
          cloneFailures: cloneResults.failed,
          totalDuration: 0,
          successCount: 0,
          failureCount: 0,
        };
        setResults(emptyResults);
        setPhase("completed");

        if (onComplete) {
          onComplete(emptyResults);
        }
      }

      service.cleanup();
    };

    runBatch();
  }, [urls, instanceCount]);

  // Handle Notion save decision
  const handleNotionSaveDecision = (saveToNotion: boolean) => {
    if (saveToNotion) {
      setPhase("notion-db-select");
    } else {
      setPhase("completed");
      if (onComplete && results) {
        onComplete(results);
      }
    }
  };

  // Handle Notion database selection
  const handleDatabaseSelected = async (databaseId: string, databaseTitle: string) => {
    if (!results) return;

    setPhase("notion-saving");

    try {
      // Create URL-to-pageId lookup map
      const urlToPageId = new Map<string, string>();
      if (urlsWithPageIds) {
        for (const item of urlsWithPageIds) {
          // Normalize URLs for matching (remove trailing slashes, .git suffix)
          const normalizedUrl = item.url.replace(/\.git$/, '').replace(/\/$/, '');
          urlToPageId.set(normalizedUrl, item.pageId);
        }
      }

      // Convert Codex results to GradingResult format
      const gradingResults: GradingResult[] = results.results
        .filter(r => r.success && r.structuredData)
        .map(r => {
          const gradingData = {
            repo_explained: r.structuredData!.repo_explained,
            developer_feedback: r.structuredData!.developer_feedback,
          };

          // Match this repository's URL to a Notion page ID
          const normalizedRepoUrl = r.repoInfo.url.replace(/\.git$/, '').replace(/\/$/, '');
          const pageId = urlToPageId.get(normalizedRepoUrl);

          return {
            repositoryName: `${r.repoInfo.owner}/${r.repoInfo.repo}`,
            githubUrl: r.repoInfo.url,
            gradingData,
            usage: r.tokensUsed,
            pageId, // Set pageId if found, undefined otherwise
          };
        });

      // Save to Notion
      const gradingService = new GradingDatabaseService();

      // Ensure database has required columns
      await gradingService.ensureGradingDatabase(databaseId, {
        processingMode: 'code'
      });

      // Save results
      const saveResult = await gradingService.saveGradingResults(
        databaseId,
        gradingResults,
        'GitHub URL',
        undefined,
        'code'
      );

      setNotionSaveStatus({
        saving: false,
        success: saveResult.success,
        failed: saveResult.failed,
        errors: saveResult.errors,
      });

      setPhase("completed");
      if (onComplete) {
        onComplete(results);
      }
    } catch (error: any) {
      console.error("Failed to save to Notion:", error);
      setNotionSaveStatus({
        saving: false,
        success: 0,
        failed: results.successCount,
        errors: [error.message || "Unknown error"],
      });
      setPhase("completed");
    }
  };

  const getStatusIcon = (status: RepoStatus["status"]) => {
    switch (status) {
      case "pending":
        return "⏳";
      case "cloning":
        return `${spinnerFrames[spinnerFrame]}`;
      case "cloned":
        return "✓";
      case "initializing":
        return `⚙️ `;
      case "analyzing":
        return `🔍`;
      case "streaming":
        return `💬`;
      case "cancelling":
        return `${spinnerFrames[spinnerFrame]}`;
      case "completed":
        return "✅";
      case "error":
        return "✗";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: RepoStatus["status"], isTimeout?: boolean) => {
    if (status === "error" && isTimeout) {
      return "yellow";
    }
    switch (status) {
      case "completed":
        return "green";
      case "error":
        return "red";
      case "cloning":
      case "initializing":
      case "analyzing":
      case "streaming":
        return "cyan";
      case "cancelling":
        return "yellow";
      case "cloned":
        return "green";
      default:
        return "gray";
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "N/A";
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Calculate viewport bounds
  const visibleRepos = repoStatuses.slice(scrollOffset, scrollOffset + VIEWPORT_SIZE);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + VIEWPORT_SIZE < repoStatuses.length;

  // Render Notion save prompt
  if (phase === "notion-prompt" && results) {
    return <NotionSavePrompt successCount={results.successCount} onDecision={handleNotionSaveDecision} />;
  }

  // Render Notion database selector
  if (phase === "notion-db-select") {
    return (
      <NotionDatabaseSelector
        onSelect={handleDatabaseSelected}
        onBack={() => setPhase("notion-prompt")}
      />
    );
  }

  // Render Notion saving status
  if (phase === "notion-saving") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>Saving to Notion...</Text>
        <Text></Text>
        <Text color="cyan">Saving grading results to Notion database...</Text>
        <Text dimColor>This may take a few moments...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Parallel Codex Batch Grading
      </Text>
      <Text></Text>

      {phase === "cloning" && (
        <>
          <Text color="cyan">
            {spinnerFrames[spinnerFrame]} Cloning repositories...
          </Text>
          <Text></Text>
        </>
      )}

      {phase === "grading" && (
        <>
          <Text color="cyan">
            {spinnerFrames[spinnerFrame]} {isAborting ? "Aborting, please wait..." : `Running parallel grading (${instanceCount} instances)...`}
          </Text>
          <Text></Text>
        </>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Box width={3}>
            <Text bold dimColor>St</Text>
          </Box>
          <Box width={30}>
            <Text bold dimColor>Repository</Text>
          </Box>
          <Box width={12}>
            <Text bold dimColor>Duration</Text>
          </Box>
          <Box width={10}>
            <Text bold dimColor>Items</Text>
          </Box>
          <Box flexGrow={1}>
            <Text bold dimColor>Status</Text>
          </Box>
        </Box>

        <Text dimColor>{"─".repeat(80)}</Text>

        {hasMoreAbove && (
          <Text dimColor>▲ {scrollOffset} more above</Text>
        )}

        {visibleRepos.map((repo, viewportIdx) => {
          const idx = scrollOffset + viewportIdx;
          const isSelected = idx === selectedRowIndex && !isAborting;
          const showActions = phase === 'grading' && isSelected;
          return (
          <Box key={idx} flexDirection="column">
            <Box>
              <Box width={3}>
                <Text color={getStatusColor(repo.status, repo.isTimeout)}>
                  {showActions ? '→' : ' '}{getStatusIcon(repo.status)}
                </Text>
              </Box>
              <Box width={30}>
                <Text
                  color={getStatusColor(repo.status, repo.isTimeout)}
                  bold={isSelected}
                >
                  {repo.owner}/{repo.repo}
                </Text>
              </Box>
              <Box width={12}>
                <Text dimColor>
                  {repo.duration ? formatDuration(repo.duration) : "-"}
                </Text>
              </Box>
              <Box width={10}>
                <Text dimColor>
                  {(repo.itemCount ?? 0) > 0 && repo.status !== "completed"
                    ? `${repo.itemCount}`
                    : "-"}
                </Text>
              </Box>
              <Box flexGrow={1}>
                {repo.currentActivity && !repo.error && repo.status !== "completed" && (
                  <Text dimColor>{repo.currentActivity}</Text>
                )}
                {repo.status === "cloned" && !repo.currentActivity && (
                  <Text color="green" dimColor>Ready for grading</Text>
                )}
                {repo.status === "error" && repo.error && (
                  <Text color={repo.isTimeout ? "yellow" : "red"} dimColor>
                    {repo.isTimeout ? "⏱️ Timeout (10 min): " :
                     repo.failureType === "clone" ? "Clone failed: " : "Grading failed: "}
                    {isSelected
                      ? repo.error
                      : (repo.error.length > 50 ? `${repo.error.substring(0, 50)}...` : repo.error)}
                  </Text>
                )}
              </Box>
            </Box>

            {repo.streamingMessage && repo.status === "streaming" && (
              <Box marginLeft={3}>
                <Text color="cyan" dimColor>
                  💬 {isSelected
                    ? repo.streamingMessage
                    : repo.streamingMessage.substring(0, 80)}
                  {!isSelected && repo.streamingMessage.length > 80 ? "..." : ""}
                </Text>
              </Box>
            )}

            {repo.status === "completed" && repo.feedback && (
              <Box marginLeft={3} flexDirection="column">
                <Text dimColor>
                  {isSelected
                    ? repo.feedback
                    : repo.feedback.substring(0, 100)}
                  {!isSelected && repo.feedback.length > 100 ? "..." : ""}
                </Text>
                {repo.tokensUsed && (
                  <Text dimColor>
                    Tokens: {repo.tokensUsed.input.toLocaleString()} in,{" "}
                    {repo.tokensUsed.output.toLocaleString()} out
                  </Text>
                )}
              </Box>
            )}
          </Box>
          );
        })}

        {hasMoreBelow && (
          <Text dimColor>▼ {repoStatuses.length - scrollOffset - VIEWPORT_SIZE} more below</Text>
        )}

        {repoStatuses.length > VIEWPORT_SIZE && (
          <Text dimColor>
            Showing {scrollOffset + 1}-{Math.min(scrollOffset + VIEWPORT_SIZE, repoStatuses.length)} of {repoStatuses.length} repos
          </Text>
        )}
      </Box>

      {/* Sticky Stats Section at Bottom */}
      <Box flexDirection="column" marginTop={1}>
        {phase === "cloning" && (
          <Text dimColor>
            Progress: {cloningProgress.current}/{cloningProgress.total}
          </Text>
        )}

        {phase === "grading" && (
          <>
            <Text dimColor>
              Processed: {gradingProgress.completed}/{gradingProgress.total} repos
            </Text>
            {!isAborting && (
              <Text dimColor>↑/↓: navigate | s: skip selected | x: stop selected | a: abort all</Text>
            )}
          </>
        )}

        {phase === "completed" && results && (
          <>
            <Text></Text>
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={
                results.cloneFailures.length + results.failureCount === 0
                  ? "green"
                  : results.successCount > 0
                  ? "yellow"
                  : "red"
              }
              paddingX={1}
            >
              <Text
                color={
                  results.cloneFailures.length + results.failureCount === 0
                    ? "green"
                    : results.successCount > 0
                    ? "yellow"
                    : "red"
                }
                bold
              >
                {isAborting ? "Aborted - Partial Results" : "Batch Grading Completed!"}
              </Text>
              <Text></Text>
              <Text>
                Total Duration: {formatDuration(results.totalDuration)}
              </Text>
              <Text color="green">Successfully Graded: {results.successCount}</Text>
              {(() => {
                const timeoutCount = repoStatuses.filter((r) => r.isTimeout).length;
                const nonTimeoutFailures = results.failureCount - timeoutCount;
                return (
                  <>
                    {nonTimeoutFailures > 0 && (
                      <Text color="red">Grading Failures: {nonTimeoutFailures}</Text>
                    )}
                    {timeoutCount > 0 && (
                      <Text color="yellow">Timeouts: {timeoutCount}</Text>
                    )}
                  </>
                );
              })()}
              {results.cloneFailures.length > 0 && (
                <Text color="red">Clone Failures: {results.cloneFailures.length}</Text>
              )}
              <Text dimColor>
                Total Processed: {results.successCount + results.failureCount + results.cloneFailures.length} repos
              </Text>
            </Box>

            {/* Show Notion save results if we saved */}
            {notionSaveStatus.success > 0 || notionSaveStatus.failed > 0 ? (
              <>
                <Text></Text>
                <Text color="blue" bold>Notion Save Results:</Text>
                {notionSaveStatus.success > 0 && (
                  <Text color="green">✓ Successfully saved {notionSaveStatus.success} {notionSaveStatus.success === 1 ? 'result' : 'results'} to Notion</Text>
                )}
                {notionSaveStatus.failed > 0 && (
                  <Text color="red">✗ Failed to save {notionSaveStatus.failed} {notionSaveStatus.failed === 1 ? 'result' : 'results'}</Text>
                )}
                {notionSaveStatus.errors.length > 0 && (
                  <Box flexDirection="column" marginLeft={2}>
                    <Text dimColor>Errors:</Text>
                    {notionSaveStatus.errors.slice(0, 3).map((err, i) => (
                      <Text key={i} dimColor>- {err}</Text>
                    ))}
                    {notionSaveStatus.errors.length > 3 && (
                      <Text dimColor>... and {notionSaveStatus.errors.length - 3} more</Text>
                    )}
                  </Box>
                )}
              </>
            ) : null}
          </>
        )}

        <Text></Text>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
