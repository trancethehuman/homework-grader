import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { CodexService } from "../lib/codex/codex-service.js";
import type { GradingPrompt } from "../consts/grading-prompts.js";
import { useSpinner } from "../hooks/useSpinner.js";
import { ErrorState } from "./ui/StateDisplays.js";

interface CodexStartingProps {
  repoPath: string;
  selectedPrompt: GradingPrompt;
  model?: string;
}

type Status = "initializing" | "running" | "completed" | "error";

interface ChronologicalItem {
  id: string;
  type: "reasoning" | "command" | "file_change" | "agent_message" | "todo_list";
  timestamp: number;
  data: Record<string, unknown>;
}

export const CodexStarting: React.FC<CodexStartingProps> = ({
  repoPath,
  selectedPrompt,
  model,
}) => {
  const [status, setStatus] = useState<Status>("initializing");
  const [currentUpdate, setCurrentUpdate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<{
    input: number;
    cached: number;
    output: number;
  } | null>(null);
  const [items, setItems] = useState<ChronologicalItem[]>([]);
  const [streamingAgentMessage, setStreamingAgentMessage] = useState<string>("");
  const [finalFeedback, setFinalFeedback] = useState<string>("");

  const spinner = useSpinner({ active: status === "running" || status === "initializing" });

  useEffect(() => {
    const startCodex = async () => {
      try {
        setStatus("running");

        const codexService = new CodexService({
          repoPath,
          model,
          skipGitRepoCheck: false,
        });

        const result = await codexService.startGrading(selectedPrompt.value, {
          onMessage: (message: string) => {
            setStreamingAgentMessage(message);
            const lines = message.split("\n").filter(Boolean);
            setCurrentUpdate(`Streaming... (${lines.length} lines)`);
          },
          onTurnCompleted: (usage) => {
            setStreamingAgentMessage("");
            if (streamingAgentMessage) {
              const timestamp = Date.now();
              const id = `agent_message-${timestamp}-${Math.random()}`;
              setItems((prev) => [
                ...prev,
                {
                  id,
                  type: "agent_message",
                  timestamp,
                  data: { text: streamingAgentMessage },
                },
              ]);
            }
            setTokensUsed({
              input: usage.input,
              cached: usage.cached,
              output: usage.output,
            });
            setStatus("completed");
          },
          onError: (err: Error) => {
            setError(err.message);
            setStatus("error");
          },
        });

        if (result.success && result.feedback) {
          setFinalFeedback(result.feedback);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        setStatus("error");
      }
    };

    startCodex();
  }, [repoPath, selectedPrompt, model]);

  const renderItem = (item: ChronologicalItem) => {
    switch (item.type) {
      case "reasoning":
        return (
          <Text key={item.id} color="magenta">
            {item.data.text as string}
          </Text>
        );
      case "command":
        return (
          <Text key={item.id} color="blue">
            $ {item.data.command as string} ({item.data.status as string})
          </Text>
        );
      case "file_change":
        return (
          <Text key={item.id} color="green">
            {item.data.kind as string}: {item.data.path as string}
          </Text>
        );
      case "agent_message":
        return (
          <Box key={item.id} flexDirection="column" marginY={1}>
            <Text color="cyan" dimColor>
              {item.data.text as string}
            </Text>
          </Box>
        );
      case "todo_list":
        return (
          <Box key={item.id} flexDirection="column" marginY={1}>
            <Text color="yellow" bold>
              Tasks:
            </Text>
            {(item.data.items as Array<{ completed: boolean; text: string }>).map(
              (todo, i: number) => (
                <Text key={i} dimColor>
                  {" "}
                  {todo.completed ? "✓" : "○"} {todo.text}
                </Text>
              )
            )}
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Codex Local Grading
      </Text>
      <Text></Text>
      <Text color="green">✓ Repository path: {repoPath}</Text>
      <Text color="cyan">✓ Prompt: {selectedPrompt.name}</Text>
      <Text></Text>

      {status === "initializing" && <Text dimColor>Initializing Codex...</Text>}

      {status === "running" && (
        <>
          <Text color="cyan">{spinner} Analyzing repository...</Text>
          <Text></Text>

          {items.map((item) => renderItem(item))}

          {streamingAgentMessage && (
            <>
              <Text></Text>
              <Box
                flexDirection="column"
                borderStyle="round"
                borderColor="cyan"
                paddingX={1}
              >
                <Text color="cyan" bold>
                  Streaming Output:
                </Text>
                <Text></Text>
                <Text dimColor>{streamingAgentMessage}</Text>
              </Box>
            </>
          )}

          <Text></Text>
          <Text color="blue">{spinner} Loading...</Text>
        </>
      )}

      {status === "completed" && (
        <>
          <Text color="green">✓ Grading completed successfully!</Text>
          {tokensUsed && (
            <>
              <Text></Text>
              <Text dimColor>
                Tokens used: {tokensUsed.input.toLocaleString()} input
                {tokensUsed.cached > 0 &&
                  ` (${tokensUsed.cached.toLocaleString()} cached)`}
                , {tokensUsed.output.toLocaleString()} output
              </Text>
            </>
          )}

          {items.length > 0 && (
            <>
              <Text></Text>
              <Text></Text>
              <Text></Text>
              {items.map((item) => renderItem(item))}
            </>
          )}

          {finalFeedback && (
            <>
              <Text></Text>
              <Text></Text>
              <Box
                flexDirection="column"
                borderStyle="round"
                borderColor="green"
                paddingX={1}
              >
                <Text color="green" bold>
                  Final Results:
                </Text>
                <Text></Text>
                <Text>{finalFeedback}</Text>
              </Box>
            </>
          )}
        </>
      )}

      {status === "error" && (
        <ErrorState
          message={error || "Unknown error occurred"}
          suggestions={[
            "Make sure you're in a Git repository",
            "Check that Codex is properly installed",
            "Verify you have the necessary permissions",
          ]}
        />
      )}

      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
