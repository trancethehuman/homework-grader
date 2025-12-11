import React from "react";
import { Text, Box } from "ink";
import { MenuSelector } from "./MenuSelector.js";
import { HelpFooter, createHelpHints } from "./HelpFooter.js";
import { formatResetTime } from "../../lib/github/rate-limit-checker.js";
import type { MenuOption } from "../../hooks/useMenuSelector.js";

type RateLimitAction = "auto-wait" | "abort";

interface RateLimitWarningProps {
  operationDescription: string;
  remaining: number;
  needed: number;
  limit: number;
  resetAt: Date;
  onAutoWait: () => void;
  onAbort: () => void;
}

export const RateLimitWarning: React.FC<RateLimitWarningProps> = ({
  operationDescription,
  remaining,
  needed,
  limit,
  resetAt,
  onAutoWait,
  onAbort,
}) => {
  const shortfall = needed - remaining;

  const options: MenuOption<RateLimitAction>[] = [
    {
      id: "auto-wait",
      name: "Auto-wait and start",
      description: "Wait for rate limit to reset, then proceed automatically",
    },
    {
      id: "abort",
      name: "Abort",
      description: `Return to previous screen. Come back ${formatResetTime(resetAt)}`,
    },
  ];

  const handleSelect = (action: RateLimitAction) => {
    if (action === "auto-wait") {
      onAutoWait();
    } else {
      onAbort();
    }
  };

  const customHeader = (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="yellow" bold>
        GitHub Rate Limit Warning
      </Text>
      <Text></Text>
      <Text>
        You are about to {operationDescription}, but only{" "}
        <Text color="yellow">{remaining}</Text> API calls remaining.
      </Text>
      <Text></Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Rate Limit Status:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>
            Remaining: <Text color="yellow">{remaining}</Text> / {limit}
          </Text>
          <Text>
            Needed: <Text color="cyan">{needed}</Text>
          </Text>
          <Text>
            Shortfall: <Text color="red">{shortfall}</Text>
          </Text>
        </Box>
      </Box>

      <Text>
        Rate limit resets <Text color="green">{formatResetTime(resetAt)}</Text>
      </Text>
      <Text></Text>
    </Box>
  );

  return (
    <Box flexDirection="column">
      <MenuSelector<RateLimitAction>
        title=""
        options={options}
        onSelect={handleSelect}
        customHeader={customHeader}
        highlightColor="yellow"
      />
      <HelpFooter hints={createHelpHints("navigate", "select")} />
    </Box>
  );
};
