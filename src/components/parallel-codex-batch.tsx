import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { ParallelCodexService, RepoEventData } from "../lib/codex/parallel-codex-service.js";
import {
  ParallelGradingResult,
  ParallelTestResults,
  ThreadItem,
} from "../lib/codex/codex-types.js";
import { getDefaultGradingPrompt } from "../consts/grading-prompts.js";
import { CODEX_GRADING_SCHEMA } from "../lib/codex/grading-schema.js";
import { NotionSavePrompt } from "./notion-save-prompt.js";
import { NotionDatabaseSelector } from "./notion-database-selector.js";
import { NotionSaving } from "./notion-saving.js";

interface ParallelCodexBatchProps {
  urls: string[];
  instanceCount: number;
  onComplete?: (results: ParallelTestResults) => void;
  onBack?: () => void;
}

type Phase = "cloning" | "grading" | "completed" | "notion_prompt" | "notion_selecting" | "notion_saving" | "final";

interface RepoStatus {
  owner: string;
  repo: string;
  status: "pending" | "cloning" | "cloned" | "initializing" | "analyzing" | "streaming" | "completed" | "error";
  error?: string;
  failureType?: "clone" | "grading";
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
  const [results, setResults] = useState<ParallelTestResults | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("");
  const [selectedDatabaseTitle, setSelectedDatabaseTitle] = useState<string>("");

  const spinnerFrames = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const runBatch = async () => {
      const service = new ParallelCodexService(urls);

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
            setRepoStatuses((prev) =>
              prev.map((repo) =>
                repo.owner === result.repoInfo.owner &&
                repo.repo === result.repoInfo.repo
                  ? {
                      ...repo,
                      status: result.success ? "completed" : "error",
                      error: result.error,
                      failureType: result.success ? undefined : ("grading" as const),
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
                    default:
                      return repo;
                  }
                }
                return repo;
              })
            );
          },
          CODEX_GRADING_SCHEMA
        );

        setResults(batchResults);
        setPhase("notion_prompt");

        if (onComplete) {
          onComplete(batchResults);
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
      case "completed":
        return "✅";
      case "error":
        return "✗";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: RepoStatus["status"]) => {
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

  if (phase === "notion_prompt") {
    return (
      <NotionSavePrompt
        onYes={() => setPhase("notion_selecting")}
        onNo={() => setPhase("final")}
      />
    );
  }

  if (phase === "notion_selecting") {
    return (
      <NotionDatabaseSelector
        onSelect={(databaseId, databaseTitle) => {
          setSelectedDatabaseId(databaseId);
          setSelectedDatabaseTitle(databaseTitle);
          setPhase("notion_saving");
        }}
        onBack={() => setPhase("notion_prompt")}
      />
    );
  }

  if (phase === "notion_saving" && results) {
    return (
      <NotionSaving
        databaseId={selectedDatabaseId}
        databaseTitle={selectedDatabaseTitle}
        gradingResults={results.results}
        onComplete={() => setPhase("final")}
        onError={(error) => {
          console.error("Error saving to Notion:", error);
          setPhase("final");
        }}
      />
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
          <Text dimColor>
            Progress: {cloningProgress.current}/{cloningProgress.total}
          </Text>
          <Text></Text>
        </>
      )}

      {phase === "grading" && (
        <>
          <Text color="cyan">
            {spinnerFrames[spinnerFrame]} Running parallel grading ({instanceCount} instances)...
          </Text>
          <Text></Text>
        </>
      )}

      {(phase === "cloning" || phase === "grading" || phase === "completed" || phase === "final") && (
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

        {repoStatuses.map((repo, idx) => (
          <Box key={idx} flexDirection="column">
            <Box>
              <Box width={3}>
                <Text color={getStatusColor(repo.status)}>
                  {getStatusIcon(repo.status)}
                </Text>
              </Box>
              <Box width={30}>
                <Text color={getStatusColor(repo.status)}>
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
                  <Text color="red" dimColor>
                    {repo.failureType === "clone" ? "Clone failed: " : "Grading failed: "}
                    {repo.error}
                  </Text>
                )}
              </Box>
            </Box>

            {repo.streamingMessage && repo.status === "streaming" && (
              <Box marginLeft={3}>
                <Text color="cyan" dimColor>
                  💬 {repo.streamingMessage.substring(0, 80)}
                  {repo.streamingMessage.length > 80 ? "..." : ""}
                </Text>
              </Box>
            )}

            {repo.status === "completed" && repo.feedback && (
              <Box marginLeft={3} flexDirection="column">
                <Text dimColor>
                  {repo.feedback.substring(0, 100)}
                  {repo.feedback.length > 100 ? "..." : ""}
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
        ))}
        </Box>
      )}

      {(phase === "completed" || phase === "final") && results && (
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
              Batch Grading Completed!
            </Text>
            <Text></Text>
            <Text>
              Total Duration: {formatDuration(results.totalDuration)}
            </Text>
            <Text color="green">Successfully Graded: {results.successCount}</Text>
            {results.failureCount > 0 && (
              <Text color="red">Grading Failures: {results.failureCount}</Text>
            )}
            {results.cloneFailures.length > 0 && (
              <Text color="red">Clone Failures: {results.cloneFailures.length}</Text>
            )}
            <Text dimColor>
              Total Processed: {results.successCount + results.failureCount + results.cloneFailures.length} repos
            </Text>
          </Box>
        </>
      )}

      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
