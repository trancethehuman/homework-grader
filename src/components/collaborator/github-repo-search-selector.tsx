import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput } from "ink";
import Spinner from "ink-spinner";
import { SearchInput } from "../ui/search-input.js";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";
import { useDebounce } from "../../hooks/index.js";
import { GitHubService, GitHubRepoResult } from "../../github/github-service.js";

type FocusArea = "list" | "search" | "back" | "account";

interface GitHubRepoSearchSelectorProps {
  githubToken: string;
  onSelect: (repo: { owner: string; repo: string; fullName: string }) => void;
  onBack?: () => void;
  onLogout?: () => void;
  onError: (error: string) => void;
}

export const GitHubRepoSearchSelector: React.FC<GitHubRepoSearchSelectorProps> = ({
  githubToken,
  onSelect,
  onBack,
  onLogout,
  onError,
}) => {
  const [repos, setRepos] = useState<GitHubRepoResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [focusArea, setFocusArea] = useState<FocusArea>("search");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(null);

  const viewportSize = 8;
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const githubServiceRef = useRef<GitHubService | null>(null);

  const isSearchFocused = focusArea === "search";
  const isBackFocused = focusArea === "back";
  const isAccountFocused = focusArea === "account";

  const filteredRepos = repos.filter((repo) => repo.permissions.admin);

  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(scrollOffset + viewportSize, filteredRepos.length);
  const displayRepos = filteredRepos.slice(visibleStartIndex, visibleEndIndex);

  useEffect(() => {
    const loadInitialRepos = async () => {
      try {
        setIsLoading(true);
        const service = new GitHubService(githubToken);
        githubServiceRef.current = service;

        const user = await service.getAuthenticatedUser();
        setAuthenticatedUser(user.login);

        const initialRepos = await service.listUserRepositories(30);
        setRepos(initialRepos);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to load repositories");
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialRepos();
  }, [githubToken, onError]);

  useEffect(() => {
    const performSearch = async () => {
      if (!githubServiceRef.current) return;

      setIsSearching(true);
      try {
        const results = await githubServiceRef.current.searchRepositories(
          debouncedSearchTerm,
          30
        );
        setRepos(results);
        setSelectedIndex(0);
        setScrollOffset(0);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm]);

  useEffect(() => {
    if (searchTerm) {
      setFocusArea("search");
    }
  }, [searchTerm]);

  useEffect(() => {
    if (filteredRepos.length === 0 && focusArea === "list") {
      setFocusArea("search");
    }
  }, [filteredRepos.length, focusArea]);

  useInput((input, key) => {
    if (isLoading) return;

    if (input === "b" && onBack && focusArea !== "search") {
      onBack();
      return;
    }

    if (input === "s" && focusArea !== "search") {
      setFocusArea("search");
      setSelectedIndex(0);
      return;
    }

    if (focusArea === "back") {
      if (key.upArrow) {
        if (filteredRepos.length > 0) {
          setFocusArea("list");
          const lastIndex = filteredRepos.length - 1;
          setSelectedIndex(lastIndex);
          const newScrollOffset = Math.max(0, lastIndex - viewportSize + 1);
          setScrollOffset(newScrollOffset);
        } else {
          setFocusArea("search");
        }
        return;
      }
      if (key.downArrow) {
        if (authenticatedUser) {
          setFocusArea("account");
        }
        return;
      }
      if (key.return) {
        onBack?.();
        return;
      }
      return;
    }

    if (focusArea === "account") {
      if (key.upArrow) {
        if (onBack) {
          setFocusArea("back");
        } else if (filteredRepos.length > 0) {
          setFocusArea("list");
          const lastIndex = filteredRepos.length - 1;
          setSelectedIndex(lastIndex);
          const newScrollOffset = Math.max(0, lastIndex - viewportSize + 1);
          setScrollOffset(newScrollOffset);
        } else {
          setFocusArea("search");
        }
        return;
      }
      if (key.return && onLogout) {
        onLogout();
        return;
      }
      return;
    }

    if (focusArea === "search") {
      if (key.return) {
        if (displayRepos.length > 0) {
          const repo = displayRepos[0];
          onSelect({ owner: repo.owner, repo: repo.repo, fullName: repo.fullName });
        }
        return;
      }

      if (key.upArrow) {
        if (filteredRepos.length > 0) {
          setFocusArea("list");
          const lastIndex = filteredRepos.length - 1;
          setSelectedIndex(lastIndex);
          const newScrollOffset = Math.max(0, lastIndex - viewportSize + 1);
          setScrollOffset(newScrollOffset);
        }
        return;
      }

      if (key.downArrow) {
        if (filteredRepos.length > 0) {
          setFocusArea("list");
          setSelectedIndex(0);
          setScrollOffset(0);
        } else if (onBack) {
          setFocusArea("back");
        }
        return;
      }

      if (key.backspace || key.delete) {
        setSearchTerm(searchTerm.slice(0, -1));
        return;
      }

      if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setSearchTerm(searchTerm + input);
        return;
      }

      return;
    }

    if (focusArea === "list") {
      if (key.upArrow) {
        if (selectedIndex > 0) {
          const newIndex = selectedIndex - 1;
          setSelectedIndex(newIndex);
          if (newIndex < scrollOffset) {
            setScrollOffset(newIndex);
          }
        } else {
          setFocusArea("search");
        }
      } else if (key.downArrow) {
        if (selectedIndex >= filteredRepos.length - 1) {
          if (onBack) {
            setFocusArea("back");
          } else {
            setFocusArea("search");
          }
        } else {
          const newIndex = selectedIndex + 1;
          setSelectedIndex(newIndex);
          if (newIndex >= scrollOffset + viewportSize) {
            setScrollOffset(newIndex - viewportSize + 1);
          }
        }
      } else if (key.return) {
        if (selectedIndex < filteredRepos.length) {
          const repo = filteredRepos[selectedIndex];
          onSelect({ owner: repo.owner, repo: repo.repo, fullName: repo.fullName });
        }
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Select Repository
        </Text>
        <Text></Text>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Loading repositories...</Text>
        </Box>
      </Box>
    );
  }

  const showScrollIndicatorTop = scrollOffset > 0;
  const showScrollIndicatorBottom = visibleEndIndex < filteredRepos.length;

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Repository
      </Text>
      <Text dimColor>Choose a repository where you have admin access</Text>
      <Text></Text>

      {isSearching && (
        <Box marginBottom={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="cyan"> Searching...</Text>
        </Box>
      )}

      {searchTerm && filteredRepos.length === 0 && !isSearching && (
        <Box marginBottom={1}>
          <Text color="yellow">No repositories with admin access found for "{searchTerm}"</Text>
        </Box>
      )}

      {filteredRepos.length > 0 && (
        <>
          {showScrollIndicatorTop && <Text dimColor> ↑ more above</Text>}

          {displayRepos.map((repo, displayIndex) => {
            const actualIndex = visibleStartIndex + displayIndex;
            const isSelected = focusArea === "list" && selectedIndex === actualIndex;

            return (
              <Box key={repo.fullName} flexDirection="column" marginBottom={0}>
                <Box>
                  <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                    {isSelected ? "→ " : "  "}
                    {repo.fullName}
                  </Text>
                  <Text color={repo.private ? "yellow" : "green"}>
                    {" "}
                    [{repo.private ? "private" : "public"}]
                  </Text>
                </Box>
                {repo.description && (
                  <Box marginLeft={4}>
                    <Text dimColor>
                      {repo.description.length > 60
                        ? repo.description.slice(0, 60) + "..."
                        : repo.description}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}

          {showScrollIndicatorBottom && <Text dimColor> ↓ more below</Text>}
        </>
      )}

      <Text></Text>
      <SearchInput
        value={searchTerm}
        placeholder="Search repositories..."
        isFocused={isSearchFocused}
        onChange={setSearchTerm}
      />

      {onBack && (
        <Box>
          <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
            ← back
          </Text>
        </Box>
      )}

      <Text></Text>
      <HelpFooter
        hints={createHelpHints("navigate", "select", ["back", !!onBack])}
      />

      {authenticatedUser && (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color={isAccountFocused ? "blue" : "gray"} bold={isAccountFocused}>
              {isAccountFocused ? "→ " : "  "}
              Authenticated as: {authenticatedUser}
            </Text>
          </Box>
          {isAccountFocused && onLogout && (
            <Box marginLeft={4}>
              <Text dimColor>Press Enter to switch account</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
