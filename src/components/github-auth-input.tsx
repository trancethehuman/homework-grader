import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import open from "open";
import { GitHubService } from "../github/github-service.js";
import { TokenStorage } from "../lib/storage/token-storage.js";

type FocusArea = "input" | "open-browser" | "back";

interface GitHubAuthInputProps {
  onAuthenticated: (token: string) => void;
  onBack?: () => void;
  onSkip?: () => void;
  existingToken?: string;
  authenticatedUser?: string;
  scope?: "repo" | "public_repo";
  title?: string;
  description?: string;
  required?: boolean;
}

const tokenStorage = new TokenStorage();

export const GitHubAuthInput: React.FC<GitHubAuthInputProps> = ({
  onAuthenticated,
  onBack,
  onSkip,
  existingToken,
  authenticatedUser,
  scope = "repo",
  title = "GitHub Authentication Required",
  description = "To continue, you need to authenticate with GitHub.",
  required = true,
}) => {
  const [input, setInput] = useState("");
  const [focusArea, setFocusArea] = useState<FocusArea>("input");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserOpened, setBrowserOpened] = useState(false);
  const [username, setUsername] = useState<string | null>(authenticatedUser || null);

  const isInputFocused = focusArea === "input";
  const isOpenBrowserFocused = focusArea === "open-browser";
  const isBackFocused = focusArea === "back";

  // Fetch username if we have an existing token
  useEffect(() => {
    if (existingToken && !username) {
      const fetchUsername = async () => {
        try {
          const githubService = new GitHubService(existingToken);
          const user = await githubService.getAuthenticatedUser();
          setUsername(user.login);
        } catch {
          // Ignore errors fetching username
        }
      };
      fetchUsername();
    }
  }, [existingToken, username]);

  // Auto-open browser on mount
  useEffect(() => {
    if (!existingToken && !browserOpened) {
      const url = `https://github.com/settings/tokens/new?description=cli-agents-fleet&scopes=${scope}`;
      open(url);
      setBrowserOpened(true);
    }
  }, [existingToken, scope, browserOpened]);

  const openGitHubPage = () => {
    const url = `https://github.com/settings/tokens/new?description=cli-agents-fleet&scopes=${scope}`;
    open(url);
    setBrowserOpened(true);
  };

  const validateAndSubmit = async (token: string) => {
    setIsValidating(true);
    setError(null);

    try {
      const githubService = new GitHubService(token);
      const validation = await githubService.validateToken();

      if (validation.valid) {
        try {
          tokenStorage.saveToken(token);
        } catch {
          // Token saving error is handled gracefully
        }
        onAuthenticated(token);
      } else {
        setError(validation.error || "Invalid token");
      }
    } catch {
      setError("Failed to validate token");
    } finally {
      setIsValidating(false);
    }
  };

  useInput((inputChar, key) => {
    if (isValidating) return;

    // Handle navigation between areas
    if (key.downArrow) {
      if (focusArea === "input") {
        setFocusArea("open-browser");
      } else if (focusArea === "open-browser" && onBack) {
        setFocusArea("back");
      }
      return;
    }

    if (key.upArrow) {
      if (focusArea === "back") {
        setFocusArea("open-browser");
      } else if (focusArea === "open-browser") {
        setFocusArea("input");
      }
      return;
    }

    // Handle input area
    if (focusArea === "input") {
      if (key.return) {
        const token = input.trim();
        if (token) {
          validateAndSubmit(token);
          setInput("");
        } else if (existingToken) {
          onAuthenticated(existingToken);
        } else if (!required && onSkip) {
          onSkip();
        }
        return;
      }

      if (key.backspace || key.delete) {
        setInput((prev) => prev.slice(0, -1));
        return;
      }

      if (inputChar && !key.ctrl && !key.meta && !key.escape) {
        setInput((prev) => prev + inputChar);
        return;
      }
    }

    // Handle open browser button
    if (focusArea === "open-browser") {
      if (key.return) {
        openGitHubPage();
        return;
      }
    }

    // Handle back button
    if (focusArea === "back") {
      if (key.return && onBack) {
        onBack();
        return;
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        {title}
      </Text>
      <Text></Text>
      <Text>{description}</Text>
      <Text></Text>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="green" bold>
          A browser window has opened to generate your token.
        </Text>
        <Text></Text>
        <Text>1. Generate a token with '{scope}' scope in the browser</Text>
        <Text>2. Copy the token</Text>
        <Text>3. Paste it below and press Enter</Text>
      </Box>

      <Text></Text>
      <Text dimColor>Paste your GitHub token:</Text>
      <Box
        borderStyle="single"
        borderColor={isInputFocused ? "blue" : "gray"}
        paddingX={1}
      >
        <Text>{input ? "*".repeat(input.length) : ""}</Text>
        {isInputFocused && <Text color="blue">█</Text>}
        {!input && !isInputFocused && <Text dimColor>Enter token here...</Text>}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {isValidating && (
        <Box marginTop={1}>
          <Text color="cyan">Validating token...</Text>
        </Box>
      )}

      {existingToken && (
        <Box marginTop={1}>
          <Text dimColor>
            Existing token: {existingToken.slice(0, 8)}... (press Enter to use)
          </Text>
        </Box>
      )}

      <Text></Text>

      {/* Open browser button */}
      <Box marginTop={1}>
        <Text
          color={isOpenBrowserFocused ? "blue" : "gray"}
          bold={isOpenBrowserFocused}
        >
          Open GitHub token page
        </Text>
      </Box>

      {/* Footer with left/right layout */}
      <Box justifyContent="space-between" marginTop={1}>
        {/* Left side - back button */}
        <Box>
          {onBack && (
            <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
              back
            </Text>
          )}
        </Box>

        {/* Right side - authenticated user */}
        <Box>
          {username && (
            <Text dimColor>
              Authenticated as: {username}
            </Text>
          )}
        </Box>
      </Box>

      <Text></Text>
      <Text dimColor>↑/↓ navigate • Enter select</Text>
    </Box>
  );
};
