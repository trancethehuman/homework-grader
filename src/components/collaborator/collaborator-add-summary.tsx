import React, { useMemo } from "react";
import { Text, Box } from "ink";
import { MenuSelector, MenuOption } from "../ui/MenuSelector.js";
import { CollaboratorResults } from "./collaborator-add-progress.js";

type SummaryAction = "retry-failed" | "add-more" | "new-repo" | "main-menu";

interface CollaboratorAddSummaryProps {
  targetRepo: { owner: string; repo: string; fullName: string };
  results: CollaboratorResults;
  onRetryFailed: (failedUsernames: string[]) => void;
  onAddMore: () => void;
  onNewRepo: () => void;
  onBackToMenu: () => void;
}

export const CollaboratorAddSummary: React.FC<CollaboratorAddSummaryProps> = ({
  targetRepo,
  results,
  onRetryFailed,
  onAddMore,
  onNewRepo,
  onBackToMenu,
}) => {
  const failedUsernames = useMemo(
    () => results.failed.map((f) => f.username),
    [results.failed]
  );

  const hasRateLimitFailures = useMemo(
    () =>
      results.failed.some(
        (f) =>
          f.error?.toLowerCase().includes("rate limit") ||
          f.error?.toLowerCase().includes("too many requests")
      ),
    [results.failed]
  );

  const options = useMemo(() => {
    const opts: MenuOption<SummaryAction>[] = [];

    if (failedUsernames.length > 0) {
      opts.push({
        id: "retry-failed",
        name: `Retry failed users (${failedUsernames.length})`,
        description: hasRateLimitFailures
          ? "Retry with rate limiting - recommended to wait a few minutes first"
          : "Attempt to add the failed users again",
      });
    }

    opts.push(
      {
        id: "add-more",
        name: "Add more users to this repository",
        description: "Continue adding collaborators to the same repository",
      },
      {
        id: "new-repo",
        name: "Choose a different repository",
        description: "Select another repository to add collaborators to",
      },
      {
        id: "main-menu",
        name: "Return to main menu",
        description: "Go back to the start screen",
      }
    );

    return opts;
  }, [failedUsernames.length, hasRateLimitFailures]);

  const handleSelect = (action: SummaryAction) => {
    switch (action) {
      case "retry-failed":
        onRetryFailed(failedUsernames);
        break;
      case "add-more":
        onAddMore();
        break;
      case "new-repo":
        onNewRepo();
        break;
      case "main-menu":
        onBackToMenu();
        break;
    }
  };

  const totalCount = results.success.length + results.failed.length;
  const invitedCount = results.success.filter((s) => s.status === "invited").length;
  const alreadyCollaboratorCount = results.success.filter(
    (s) => s.status === "already_collaborator"
  ).length;

  return (
    <Box flexDirection="column">
      <Text color="green" bold>
        Collaborator Addition Complete
      </Text>
      <Text dimColor>Repository: {targetRepo.fullName}</Text>
      <Text></Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Total processed: <Text bold>{totalCount}</Text> users
        </Text>
        <Box marginLeft={2} flexDirection="column">
          <Text color="green">
            ✓ Invited: <Text bold>{invitedCount}</Text>
          </Text>
          {alreadyCollaboratorCount > 0 && (
            <Text color="cyan">
              ○ Already collaborators: <Text bold>{alreadyCollaboratorCount}</Text>
            </Text>
          )}
          {results.failed.length > 0 && (
            <Text color="red">
              ✗ Failed: <Text bold>{results.failed.length}</Text>
            </Text>
          )}
        </Box>
      </Box>

      {results.failed.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>
            Failed Users:
          </Text>
          {results.failed.slice(0, 5).map((f) => (
            <Box key={f.username} marginLeft={2}>
              <Text color="red">
                • {f.username}: {f.error}
              </Text>
            </Box>
          ))}
          {results.failed.length > 5 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {results.failed.length - 5} more</Text>
            </Box>
          )}
        </Box>
      )}

      <Text></Text>
      <Text bold>What would you like to do next?</Text>
      <Text></Text>

      <MenuSelector
        title=""
        options={options}
        onSelect={handleSelect}
      />
    </Box>
  );
};
