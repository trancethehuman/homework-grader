import React from "react";
import { Text, Box, useInput } from "ink";
import { useCountdown } from "../../hooks/useCountdown.js";
import { useSpinner } from "../../hooks/useSpinner.js";
import { HelpFooter, createHelpHints } from "./HelpFooter.js";

interface RateLimitCountdownProps {
  resetAt: Date;
  operationDescription: string;
  onResetComplete: () => void;
  onCancel: () => void;
}

export const RateLimitCountdown: React.FC<RateLimitCountdownProps> = ({
  resetAt,
  operationDescription,
  onResetComplete,
  onCancel,
}) => {
  const { remainingFormatted, isComplete } = useCountdown({
    targetTime: resetAt,
    onComplete: onResetComplete,
  });

  const spinner = useSpinner({ active: !isComplete });

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  if (isComplete) {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          Rate limit reset!
        </Text>
        <Text>Starting {operationDescription}...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Waiting for GitHub Rate Limit Reset
      </Text>
      <Text></Text>

      <Text>
        {spinner} {operationDescription} will begin automatically when the rate
        limit resets.
      </Text>
      <Text></Text>

      <Box marginBottom={1}>
        <Text>
          Time remaining:{" "}
          <Text color="cyan" bold>
            {remainingFormatted}
          </Text>
        </Text>
      </Box>

      <Text></Text>
      <HelpFooter hints={createHelpHints("backEsc")} />
    </Box>
  );
};
