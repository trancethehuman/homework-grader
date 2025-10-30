import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import {
  GitHubIssueService,
  GitHubIssueResult,
  RepositoryFeedback,
} from '../lib/github-issue-service.js';

interface GitHubIssueCreatorProps {
  feedbacks: RepositoryFeedback[];
  githubToken: string;
  onComplete: () => void;
}

type Phase = 'creating' | 'completed';

export const GitHubIssueCreator: React.FC<GitHubIssueCreatorProps> = ({
  feedbacks,
  githubToken,
  onComplete,
}) => {
  const [phase, setPhase] = useState<Phase>('creating');
  const [currentProgress, setCurrentProgress] = useState(0);
  const [results, setResults] = useState<GitHubIssueResult[]>([]);

  useEffect(() => {
    const createIssues = async () => {
      const service = new GitHubIssueService(githubToken);

      const issueResults = await service.createIssuesForBatch(feedbacks, (current, total) => {
        setCurrentProgress(current);
      });

      setResults(issueResults);
      setPhase('completed');

      // Auto-complete after showing results
      setTimeout(() => {
        onComplete();
      }, 5000);
    };

    createIssues();
  }, [feedbacks, githubToken, onComplete]);

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  if (phase === 'creating') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="blue">
            <Spinner type="dots" />
          </Text>
          <Text> Creating GitHub issues... ({currentProgress}/{feedbacks.length})</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          ✅ GitHub Issues Created
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Success: <Text color="green">{successCount}</Text> | Failed:{' '}
          <Text color="red">{failureCount}</Text>
        </Text>
      </Box>

      {failureCount > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="red">
            Failed Issues:
          </Text>
          {results
            .filter((r) => !r.success)
            .slice(0, 5)
            .map((result, index) => (
              <Box key={index} marginLeft={2}>
                <Text>
                  • <Text color="red">{result.repoUrl}</Text>
                  {result.error && <Text dimColor> - {result.error}</Text>}
                </Text>
              </Box>
            ))}
          {failureCount > 5 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {failureCount - 5} more</Text>
            </Box>
          )}
        </Box>
      )}

      {successCount > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="green">
            Successfully Created Issues:
          </Text>
          {results
            .filter((r) => r.success)
            .slice(0, 5)
            .map((result, index) => (
              <Box key={index} marginLeft={2}>
                <Text>
                  • Issue #{result.issueNumber} in{' '}
                  <Text color="blue">{result.repoUrl.split('/').slice(-2).join('/')}</Text>
                </Text>
                {result.issueUrl && (
                  <Box marginLeft={2}>
                    <Text dimColor>{result.issueUrl}</Text>
                  </Box>
                )}
              </Box>
            ))}
          {successCount > 5 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {successCount - 5} more</Text>
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Continuing in 5 seconds...</Text>
      </Box>
    </Box>
  );
};
