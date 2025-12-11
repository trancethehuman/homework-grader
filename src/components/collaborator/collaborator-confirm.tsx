import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";
import { RateLimitWarning } from "../ui/RateLimitWarning.js";
import { GitHubService } from "../../github/github-service.js";
import { useSpinner } from "../../hooks/useSpinner.js";
import type { RateLimitCheckResult } from "../../lib/github/rate-limit-checker.js";

interface CollaboratorConfirmProps {
  targetRepo: string;
  usernames: string[];
  githubToken: string;
  onConfirm: () => void;
  onAutoWait: (resetAt: Date) => void;
  onBack: () => void;
}

type CheckState = "checking" | "sufficient" | "insufficient" | "error";

export const CollaboratorConfirm: React.FC<CollaboratorConfirmProps> = ({
  targetRepo,
  usernames,
  githubToken,
  onConfirm,
  onAutoWait,
  onBack,
}) => {
  const [checkState, setCheckState] = useState<CheckState>("checking");
  const [rateLimitResult, setRateLimitResult] =
    useState<RateLimitCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const uniqueUsernames = [
    ...new Set(usernames.map((u) => u.trim().toLowerCase())),
  ];
  const duplicateCount = usernames.length - uniqueUsernames.length;

  const spinner = useSpinner({ active: checkState === "checking" });

  useEffect(() => {
    const checkRateLimit = async () => {
      try {
        const githubService = new GitHubService(githubToken);
        const result = await githubService.checkRateLimitForBulkOperation(
          uniqueUsernames.length
        );
        setRateLimitResult(result);
        setCheckState(result.sufficient ? "sufficient" : "insufficient");
      } catch (error: any) {
        setErrorMessage(error.message || "Failed to check rate limit");
        setCheckState("error");
      }
    };

    checkRateLimit();
  }, [githubToken, uniqueUsernames.length]);

  useInput(
    (input, key) => {
      if (checkState === "sufficient" || checkState === "error") {
        if (key.return) {
          onConfirm();
        } else if (key.escape) {
          onBack();
        }
      } else if (checkState === "checking") {
        if (key.escape) {
          onBack();
        }
      }
    },
    { isActive: checkState !== "insufficient" }
  );

  if (checkState === "checking") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Confirm Adding Collaborators
        </Text>
        <Text dimColor>Repository: {targetRepo}</Text>
        <Text></Text>
        <Text>
          {spinner} Checking GitHub rate limit...
        </Text>
        <Text></Text>
        <HelpFooter hints={createHelpHints("backEsc")} />
      </Box>
    );
  }

  if (checkState === "insufficient" && rateLimitResult) {
    return (
      <RateLimitWarning
        operationDescription={`add ${uniqueUsernames.length} collaborators`}
        remaining={rateLimitResult.remaining}
        needed={rateLimitResult.needed}
        limit={rateLimitResult.limit}
        resetAt={rateLimitResult.resetAt}
        onAutoWait={() => onAutoWait(rateLimitResult.resetAt)}
        onAbort={onBack}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Confirm Adding Collaborators
      </Text>
      <Text dimColor>Repository: {targetRepo}</Text>
      <Text></Text>

      {checkState === "error" && errorMessage && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Warning: Could not check rate limit ({errorMessage}). Proceeding
            anyway.
          </Text>
        </Box>
      )}

      {rateLimitResult && (
        <Box marginBottom={1}>
          <Text dimColor>
            Rate limit: {rateLimitResult.remaining} / {rateLimitResult.limit}{" "}
            remaining
          </Text>
        </Box>
      )}

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Ready to add{" "}
          <Text bold color="cyan">
            {uniqueUsernames.length}
          </Text>{" "}
          unique users as collaborators
        </Text>
        {duplicateCount > 0 && (
          <Text dimColor>
            ({duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"} will be
            skipped)
          </Text>
        )}
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Preview (first 10 usernames):</Text>
        <Box flexDirection="column" marginLeft={2}>
          {uniqueUsernames.slice(0, 10).map((username) => (
            <Text key={username} color="white">
              - {username}
            </Text>
          ))}
          {uniqueUsernames.length > 10 && (
            <Text dimColor>... and {uniqueUsernames.length - 10} more</Text>
          )}
        </Box>
      </Box>

      <Text></Text>
      <Box flexDirection="row" gap={2}>
        <Text color="green">[Enter] Start adding collaborators</Text>
        <Text color="yellow">[Esc] Go back</Text>
      </Box>
      <Text></Text>
      <HelpFooter hints={createHelpHints("select", "backEsc")} />
    </Box>
  );
};
