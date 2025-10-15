import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { ParallelCodexService, RepoEventData } from "../lib/codex/parallel-codex-service.js";
import {
  ClonedTestRepo,
  ParallelGradingResult,
  ParallelTestResults,
  ThreadItem,
} from "../lib/codex/codex-types.js";
import { getDefaultGradingPrompt } from "../consts/grading-prompts.js";

interface ParallelCodexTestProps {
  onBack: () => void;
  instanceCount: number;
}

type Phase = "cloning" | "grading" | "completed" | "error";

interface RepoStatus {
  owner: string;
  repo: string;
  status: "pending" | "cloning" | "cloned" | "initializing" | "analyzing" | "streaming" | "completed" | "error";
  error?: string;
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

export const ParallelCodexTest: React.FC<ParallelCodexTestProps> = ({
  onBack,
  instanceCount,
}) => {
  const [phase, setPhase] = useState<Phase>("cloning");
  const [repoStatuses, setRepoStatuses] = useState<RepoStatus[]>(() => {
    const service = new ParallelCodexService(instanceCount);
    const testRepoUrls = service.getTestRepoUrls();
    return testRepoUrls.map((url) => {
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
  }>({ current: 0, total: instanceCount, message: "" });
  const [results, setResults] = useState<ParallelTestResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  const spinnerFrames = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const runTest = async () => {
      const service = new ParallelCodexService(instanceCount);

      try {
        const clonedRepos = await service.cloneRepositories(
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
          prev.map((repo) => ({ ...repo, status: "pending" }))
        );
        setPhase("grading");

        const defaultPrompt = getDefaultGradingPrompt();

        const testResults = await service.runParallelGrading(
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
          }
        );

        setResults(testResults);
        setPhase("completed");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        setPhase("error");
      } finally {
        service.cleanup();
      }
    };

    runTest();
  }, []);

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

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Parallel Codex Test (TEMPORARY)
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
            {spinnerFrames[spinnerFrame]} Running parallel grading...
          </Text>
          <Text></Text>
        </>
      )}

      <Box flexDirection="column" marginBottom={1}>
        {/* Table Header */}
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

        {/* Separator */}
        <Text dimColor>{"─".repeat(80)}</Text>

        {/* Table Rows */}
        {repoStatuses.map((repo, idx) => (
          <Box key={idx} flexDirection="column">
            {/* Main row */}
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
                  <Text color="red" dimColor>Error: {repo.error}</Text>
                )}
              </Box>
            </Box>

            {/* Streaming message row (if present) */}
            {repo.streamingMessage && repo.status === "streaming" && (
              <Box marginLeft={3}>
                <Text color="cyan" dimColor>
                  💬 {repo.streamingMessage.substring(0, 80)}
                  {repo.streamingMessage.length > 80 ? "..." : ""}
                </Text>
              </Box>
            )}

            {/* Feedback row (if completed) */}
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

      {phase === "completed" && results && (
        <>
          <Text></Text>
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="green"
            paddingX={1}
          >
            <Text color="green" bold>
              Test Completed Successfully!
            </Text>
            <Text></Text>
            <Text>
              Total Duration: {formatDuration(results.totalDuration)}
            </Text>
            <Text color="green">Success: {results.successCount}</Text>
            <Text color="red">Failures: {results.failureCount}</Text>
          </Box>
        </>
      )}

      {phase === "error" && error && (
        <>
          <Text color="red">✗ Test failed</Text>
          <Text></Text>
          <Text color="red">{error}</Text>
        </>
      )}

      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
