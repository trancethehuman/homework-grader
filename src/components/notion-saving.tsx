import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { GradingDatabaseService } from "../lib/notion/grading-database-service.js";
import { NotionOAuthClient } from "../lib/notion/oauth-client.js";
import { GradingResult } from "../lib/file-saver.js";
import { ParallelGradingResult } from "../lib/codex/codex-types.js";
import { CodexGradingOutput } from "../lib/codex/grading-schema.js";

interface NotionSavingProps {
  databaseId: string;
  databaseTitle: string;
  gradingResults: ParallelGradingResult[];
  onComplete: () => void;
  onError: (error: string) => void;
}

export const NotionSaving: React.FC<NotionSavingProps> = ({
  databaseId,
  databaseTitle,
  gradingResults,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<"saving" | "success" | "error">("saving");
  const [saveStats, setSaveStats] = useState<{
    success: number;
    failed: number;
    skipped: number;
  }>({ success: 0, failed: 0, skipped: 0 });
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const saveToNotion = async () => {
      try {
        setStatus("saving");

        const oauth = new NotionOAuthClient();
        const token = await oauth.ensureAuthenticated();
        const gradingDbService = new GradingDatabaseService(token.access_token);

        await gradingDbService.ensureGradingDatabase(databaseId, {
          processingMode: "code",
        });

        const formattedResults: GradingResult[] = gradingResults.map((result) => {
          if (!result.success) {
            return {
              repositoryName: `${result.repoInfo.owner}/${result.repoInfo.repo}`,
              githubUrl: result.repoInfo.url,
              gradingData: null,
              usage: null,
              error: result.error || "Grading failed",
            };
          }

          const structuredOutput = result.structuredOutput as CodexGradingOutput | undefined;

          return {
            repositoryName: `${result.repoInfo.owner}/${result.repoInfo.repo}`,
            githubUrl: result.repoInfo.url,
            gradingData: structuredOutput
              ? {
                  repo_explained: structuredOutput.repo_explained,
                  developer_feedback: structuredOutput.developer_feedback,
                }
              : null,
            usage: result.tokensUsed
              ? {
                  inputTokens: result.tokensUsed.input,
                  outputTokens: result.tokensUsed.output,
                  totalTokens: result.tokensUsed.total,
                  cachedInputTokens: result.tokensUsed.cached,
                }
              : null,
          };
        });

        const saveResult = await gradingDbService.saveGradingResultsWithConflictCheck(
          databaseId,
          formattedResults,
          undefined,
          undefined,
          "code",
          async (conflictInfo) => {
            return "override";
          }
        );

        setSaveStats({
          success: saveResult.success,
          failed: saveResult.failed,
          skipped: saveResult.skipped,
        });

        if (saveResult.failed > 0) {
          setStatus("error");
          setErrorMessage(
            `Failed to save ${saveResult.failed} results. Check console for details.`
          );
          onError(errorMessage);
        } else {
          setStatus("success");
          setTimeout(() => {
            onComplete();
          }, 2000);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save to Notion";
        setStatus("error");
        setErrorMessage(message);
        onError(message);
      }
    };

    saveToNotion();
  }, [databaseId, gradingResults]);

  if (status === "saving") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Saving Grading Results to Notion
        </Text>
        <Box marginTop={1}>
          <Text>Database: {databaseTitle}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Saving {gradingResults.length} results...</Text>
        </Box>
      </Box>
    );
  }

  if (status === "success") {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Successfully Saved to Notion!
        </Text>
        <Box marginTop={1}>
          <Text>Database: {databaseTitle}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="green">
            Saved: {saveStats.success} | Failed: {saveStats.failed} | Skipped:{" "}
            {saveStats.skipped}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        Error Saving to Notion
      </Text>
      <Box marginTop={1}>
        <Text>{errorMessage}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press any key to continue...</Text>
      </Box>
    </Box>
  );
};
