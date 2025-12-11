import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { HelpFooter, createHelpHints } from "./ui/HelpFooter.js";
import { RateLimitWarning } from "./ui/RateLimitWarning.js";
import { GitHubService } from "../github/github-service.js";
import { useSpinner } from "../hooks/useSpinner.js";
import type { RateLimitCheckResult } from "../lib/github/rate-limit-checker.js";

interface GitHubIssueRateLimitCheckProps {
  repoCount: number;
  githubToken: string;
  onProceed: () => void;
  onAutoWait: (resetAt: Date) => void;
  onBack: () => void;
}

type CheckState = "checking" | "sufficient" | "insufficient" | "error";

export const GitHubIssueRateLimitCheck: React.FC<
  GitHubIssueRateLimitCheckProps
> = ({ repoCount, githubToken, onProceed, onAutoWait, onBack }) => {
  const [checkState, setCheckState] = useState<CheckState>("checking");
  const [rateLimitResult, setRateLimitResult] =
    useState<RateLimitCheckResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const operationsNeeded = repoCount * 2;

  const spinner = useSpinner({ active: checkState === "checking" });

  useEffect(() => {
    const checkRateLimit = async () => {
      try {
        const githubService = new GitHubService(githubToken);
        const result =
          await githubService.checkRateLimitForBulkOperation(operationsNeeded);
        setRateLimitResult(result);

        if (result.sufficient) {
          setCheckState("sufficient");
          onProceed();
        } else {
          setCheckState("insufficient");
        }
      } catch (error: any) {
        setErrorMessage(error.message || "Failed to check rate limit");
        setCheckState("error");
        onProceed();
      }
    };

    checkRateLimit();
  }, [githubToken, operationsNeeded, onProceed]);

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
      }
    },
    { isActive: checkState === "checking" }
  );

  if (checkState === "checking") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Creating GitHub Issues
        </Text>
        <Text dimColor>Preparing to create {repoCount} issues</Text>
        <Text></Text>
        <Text>{spinner} Checking GitHub rate limit...</Text>
        <Text></Text>
        <HelpFooter hints={createHelpHints("backEsc")} />
      </Box>
    );
  }

  if (checkState === "insufficient" && rateLimitResult) {
    return (
      <RateLimitWarning
        operationDescription={`create ${repoCount} GitHub issues`}
        remaining={rateLimitResult.remaining}
        needed={rateLimitResult.needed}
        limit={rateLimitResult.limit}
        resetAt={rateLimitResult.resetAt}
        onAutoWait={() => onAutoWait(rateLimitResult.resetAt)}
        onAbort={onBack}
      />
    );
  }

  return null;
};
