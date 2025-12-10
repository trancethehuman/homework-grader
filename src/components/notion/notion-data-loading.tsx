import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import Spinner from "ink-spinner";

export type LoadingPhase = "warming-up" | "authenticating" | "fetching";

interface NotionDataLoadingProps {
  title?: string;
  message?: string;
  phase?: LoadingPhase;
  startTime?: number;
}

const PHASE_MESSAGES: Record<LoadingPhase, string> = {
  "warming-up":
    "Waking up the server (this may take up to 60 seconds on first use)...",
  authenticating: "Verifying your Notion access...",
  fetching: "Loading pages and databases from your workspace...",
};

const PHASE_TITLES: Record<LoadingPhase, string> = {
  "warming-up": "Connecting to Notion",
  authenticating: "Authenticating",
  fetching: "Loading Notion Data",
};

export const NotionDataLoading: React.FC<NotionDataLoadingProps> = ({
  title,
  message,
  phase,
  startTime,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const displayTitle = title || (phase ? PHASE_TITLES[phase] : "Loading Notion Data...");
  const displayMessage =
    message || (phase ? PHASE_MESSAGES[phase] : "This may take a moment while we fetch your data...");

  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Box flexDirection="column" alignItems="center">
      <Text bold color="blue">
        {displayTitle}
      </Text>
      <Box marginTop={1} alignItems="center">
        <Text color="green">
          <Spinner type="earth" />
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color="cyan">{displayMessage}</Text>
      </Box>
      {startTime && elapsedSeconds > 0 && (
        <Box marginTop={1}>
          <Text dimColor>Elapsed: {formatTime(elapsedSeconds)}</Text>
        </Box>
      )}
      {phase === "warming-up" && elapsedSeconds > 10 && (
        <Box marginTop={1}>
          <Text color="yellow">
            The server appears to be starting up. This is normal for the first request.
          </Text>
        </Box>
      )}
    </Box>
  );
};
