import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { CodexService } from "../lib/codex/codex-service.js";
import type { ThreadItem } from "../lib/codex/codex-types.js";
import type { GradingPrompt } from "../consts/grading-prompts.js";

interface CodexStartingProps {
  repoPath: string;
  selectedPrompt: GradingPrompt;
}

type Status = "initializing" | "running" | "completed" | "error";

interface ItemsByType {
  agentMessage: string;
  reasoning: string[];
  commands: Array<{ command: string; status: string }>;
  fileChanges: Array<{ kind: string; path: string }>;
  todos: Array<{ text: string; completed: boolean }>;
}

export const CodexStarting: React.FC<CodexStartingProps> = ({ repoPath, selectedPrompt }) => {
  const [status, setStatus] = useState<Status>("initializing");
  const [currentUpdate, setCurrentUpdate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<{ input: number; cached: number; output: number } | null>(null);
  const [dots, setDots] = useState("");
  const [items, setItems] = useState<ItemsByType>({
    agentMessage: "",
    reasoning: [],
    commands: [],
    fileChanges: [],
    todos: [],
  });
  const [finalFeedback, setFinalFeedback] = useState<string>("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const startCodex = async () => {
      try {
        setStatus("running");

        const codexService = new CodexService({
          repoPath,
          skipGitRepoCheck: false,
        });

        const result = await codexService.startGrading(selectedPrompt.value, {
          onItemUpdated: (item: ThreadItem) => {
            if (item.type === "agent_message") {
              setItems((prev) => ({
                ...prev,
                agentMessage: item.text,
              }));
              const lines = item.text.split("\n").filter(Boolean);
              const lastLine = lines[lines.length - 1] || "";
              setCurrentUpdate(`Streaming... (${lines.length} lines)`);
            } else if (item.type === "todo_list") {
              setItems((prev) => ({
                ...prev,
                todos: item.items || [],
              }));
              setCurrentUpdate("Updating todo list...");
            }
          },
          onItemCompleted: (item: ThreadItem) => {
            if (item.type === "agent_message") {
              setItems((prev) => ({
                ...prev,
                agentMessage: item.text,
              }));
            } else if (item.type === "reasoning") {
              setItems((prev) => ({
                ...prev,
                reasoning: [...prev.reasoning, item.text],
              }));
            } else if (item.type === "command_execution") {
              setItems((prev) => ({
                ...prev,
                commands: [
                  ...prev.commands,
                  { command: item.command, status: item.status },
                ],
              }));
            } else if (item.type === "file_change") {
              const changes = item.changes || [];
              setItems((prev) => ({
                ...prev,
                fileChanges: [
                  ...prev.fileChanges,
                  ...changes.map((c: any) => ({ kind: c.kind, path: c.path })),
                ],
              }));
            }
          },
          onTurnCompleted: (usage) => {
            setTokensUsed({
              input: usage.input_tokens,
              cached: usage.cached_input_tokens,
              output: usage.output_tokens,
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
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        setError(errorMessage);
        setStatus("error");
      }
    };

    startCodex();
  }, [repoPath, selectedPrompt]);

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Codex Local Grading{status === "running" ? dots : ""}
      </Text>
      <Text></Text>
      <Text color="green">✓ Repository path: {repoPath}</Text>
      <Text color="cyan">✓ Prompt: {selectedPrompt.name}</Text>
      <Text></Text>

      {status === "initializing" && (
        <Text dimColor>Initializing Codex...</Text>
      )}

      {status === "running" && (
        <>
          <Text color="cyan">⚡ Analyzing repository...</Text>
          {currentUpdate && (
            <>
              <Text></Text>
              <Text dimColor>{currentUpdate}</Text>
            </>
          )}

          {items.agentMessage && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
                <Text color="cyan" bold>Streaming Output:</Text>
                <Text></Text>
                <Text>{items.agentMessage}</Text>
              </Box>
            </>
          )}

          {items.todos.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
                <Text color="yellow" bold>Tasks:</Text>
                {items.todos.map((todo, i) => (
                  <Text key={i} dimColor>
                    {todo.completed ? "✓" : "○"} {todo.text}
                  </Text>
                ))}
              </Box>
            </>
          )}

          {items.reasoning.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
                <Text color="magenta" bold>Reasoning:</Text>
                {items.reasoning.map((reason, i) => (
                  <Text key={i} dimColor>{reason}</Text>
                ))}
              </Box>
            </>
          )}

          {items.commands.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
                <Text color="blue" bold>Commands:</Text>
                {items.commands.map((cmd, i) => (
                  <Text key={i} dimColor>
                    $ {cmd.command} ({cmd.status})
                  </Text>
                ))}
              </Box>
            </>
          )}

          {items.fileChanges.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
                <Text color="green" bold>File Changes:</Text>
                {items.fileChanges.map((change, i) => (
                  <Text key={i} dimColor>
                    {change.kind}: {change.path}
                  </Text>
                ))}
              </Box>
            </>
          )}
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
                {tokensUsed.cached > 0 && ` (${tokensUsed.cached.toLocaleString()} cached)`}, {tokensUsed.output.toLocaleString()} output
              </Text>
            </>
          )}

          {finalFeedback && (
            <>
              <Text></Text>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
                <Text color="green" bold>Final Results:</Text>
                <Text></Text>
                <Text>{finalFeedback}</Text>
              </Box>
            </>
          )}

          {items.reasoning.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
                <Text color="magenta" bold>Reasoning Steps ({items.reasoning.length}):</Text>
                {items.reasoning.map((reason, i) => (
                  <Text key={i} dimColor>{reason}</Text>
                ))}
              </Box>
            </>
          )}

          {items.commands.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
                <Text color="blue" bold>Commands Executed ({items.commands.length}):</Text>
                {items.commands.map((cmd, i) => (
                  <Text key={i} dimColor>
                    $ {cmd.command} ({cmd.status})
                  </Text>
                ))}
              </Box>
            </>
          )}

          {items.fileChanges.length > 0 && (
            <>
              <Text></Text>
              <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1}>
                <Text color="green" bold>File Changes ({items.fileChanges.length}):</Text>
                {items.fileChanges.map((change, i) => (
                  <Text key={i} dimColor>
                    {change.kind}: {change.path}
                  </Text>
                ))}
              </Box>
            </>
          )}
        </>
      )}

      {status === "error" && (
        <>
          <Text color="red">✗ Error occurred during grading</Text>
          <Text></Text>
          <Text color="red">{error}</Text>
          <Text></Text>
          <Text dimColor>Common issues:</Text>
          <Text dimColor>• Make sure you're in a Git repository</Text>
          <Text dimColor>• Check that Codex is properly installed</Text>
          <Text dimColor>• Verify you have the necessary permissions</Text>
        </>
      )}

      <Text></Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
