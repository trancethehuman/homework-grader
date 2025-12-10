import React from "react";
import { Text, Box } from "ink";
import { useSpinner } from "../../hooks/useSpinner.js";

/**
 * Props for LoadingState component.
 */
export interface LoadingStateProps {
  message?: string;
  showSpinner?: boolean;
}

/**
 * Displays a loading state with optional spinner and message.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  message = "Loading...",
  showSpinner = true,
}) => {
  const spinner = useSpinner();

  return (
    <Box flexDirection="column">
      <Text color="cyan">
        {showSpinner && `${spinner} `}
        {message}
      </Text>
    </Box>
  );
};

/**
 * Props for ErrorState component.
 */
export interface ErrorStateProps {
  title?: string;
  message: string;
  suggestions?: string[];
  showBackHint?: boolean;
}

/**
 * Displays an error state with optional suggestions and back hint.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = "Error",
  message,
  suggestions,
  showBackHint = true,
}) => {
  return (
    <Box flexDirection="column">
      <Text color="red" bold>
        {title}
      </Text>
      <Text></Text>
      <Text color="red">{message}</Text>
      {suggestions && suggestions.length > 0 && (
        <>
          <Text></Text>
          <Text dimColor>Suggestions:</Text>
          {suggestions.map((suggestion, index) => (
            <Text key={index} dimColor>
              • {suggestion}
            </Text>
          ))}
        </>
      )}
      {showBackHint && (
        <>
          <Text></Text>
          <Text dimColor>Press 'b' to go back</Text>
        </>
      )}
    </Box>
  );
};

/**
 * Props for EmptyState component.
 */
export interface EmptyStateProps {
  message: string;
  hint?: string;
  showBackHint?: boolean;
}

/**
 * Displays an empty state with optional hint.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  hint,
  showBackHint = true,
}) => {
  return (
    <Box flexDirection="column">
      <Text color="yellow">{message}</Text>
      {hint && (
        <>
          <Text></Text>
          <Text dimColor>{hint}</Text>
        </>
      )}
      {showBackHint && (
        <>
          <Text></Text>
          <Text dimColor>Press 'b' to go back</Text>
        </>
      )}
    </Box>
  );
};

/**
 * Props for SuccessState component.
 */
export interface SuccessStateProps {
  message: string;
  details?: string[];
}

/**
 * Displays a success state with optional details.
 */
export const SuccessState: React.FC<SuccessStateProps> = ({
  message,
  details,
}) => {
  return (
    <Box flexDirection="column">
      <Text color="green" bold>
        ✓ {message}
      </Text>
      {details && details.length > 0 && (
        <>
          <Text></Text>
          {details.map((detail, index) => (
            <Text key={index} dimColor>
              {detail}
            </Text>
          ))}
        </>
      )}
    </Box>
  );
};

/**
 * Props for ProgressState component.
 */
export interface ProgressStateProps {
  current: number;
  total: number;
  message?: string;
  showPercentage?: boolean;
}

/**
 * Displays a progress state with current/total count.
 */
export const ProgressState: React.FC<ProgressStateProps> = ({
  current,
  total,
  message,
  showPercentage = true,
}) => {
  const spinner = useSpinner();
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <Box flexDirection="column">
      <Text color="cyan">
        {spinner} {message || "Processing..."}
      </Text>
      <Text>
        Progress: {current}/{total}
        {showPercentage && ` (${percentage}%)`}
      </Text>
    </Box>
  );
};
