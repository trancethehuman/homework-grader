import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput } from "ink";
import Spinner from "ink-spinner";
import { SearchInput } from "../ui/search-input.js";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";
import {
  useDebounce,
  useFocusNavigation,
  ListRegionState,
  InputRegionState,
} from "../../hooks/index.js";
import { GitHubService, GitHubRepoResult } from "../../github/github-service.js";

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(null);

  const viewportSize = 8;
  const githubServiceRef = useRef<GitHubService | null>(null);

  const filteredRepos = repos.filter((repo) => repo.permissions.admin);

  const handleRepoSelect = (index: number) => {
    if (index < filteredRepos.length) {
      const repo = filteredRepos[index];
      onSelect({ owner: repo.owner, repo: repo.repo, fullName: repo.fullName });
    }
  };

  const {
    focusedRegion,
    regionStates,
    focusRegion,
    inputSetValue,
    listSelectIndex,
  } = useFocusNavigation({
    regions: [
      {
        id: "list",
        type: "list",
        itemCount: filteredRepos.length,
        viewportSize,
        enabled: filteredRepos.length > 0,
        onSelect: handleRepoSelect,
      },
      {
        id: "search",
        type: "input",
        reservedKeys: ["b", "s"],
      },
      {
        id: "back",
        type: "button",
        enabled: !!onBack,
        onActivate: onBack,
      },
      {
        id: "account",
        type: "button",
        enabled: !!authenticatedUser,
        onActivate: onLogout,
      },
    ],
    initialFocus: "search",
    disabled: isLoading,
  });

  const listState = regionStates.list as ListRegionState | undefined;
  const searchState = regionStates.search as InputRegionState;

  const searchTerm = searchState?.value ?? "";
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const selectedIndex = listState?.selectedIndex ?? 0;
  const scrollOffset = listState?.scrollOffset ?? 0;
  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(scrollOffset + viewportSize, filteredRepos.length);
  const displayRepos = filteredRepos.slice(visibleStartIndex, visibleEndIndex);

  const isSearchFocused = focusedRegion === "search";
  const isBackFocused = focusedRegion === "back";
  const isAccountFocused = focusedRegion === "account";

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
        listSelectIndex("list", 0);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm, listSelectIndex]);

  // Handle shortcuts that aren't part of standard navigation
  useInput(
    (input, key) => {
      if (isLoading) return;

      // Global shortcut: 'b' to go back (except when typing in search)
      if (input === "b" && onBack && focusedRegion !== "search") {
        onBack();
        return;
      }

      // Global shortcut: 's' to focus search
      if (input === "s" && focusedRegion !== "search") {
        focusRegion("search");
        return;
      }

      // When search is focused and Enter is pressed, select first visible repo
      if (focusedRegion === "search" && key.return && displayRepos.length > 0) {
        const repo = displayRepos[0];
        onSelect({ owner: repo.owner, repo: repo.repo, fullName: repo.fullName });
      }
    },
    { isActive: !isLoading }
  );

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
            const isSelected = focusedRegion === "list" && selectedIndex === actualIndex;

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
        onChange={(value) => inputSetValue("search", value)}
      />

      {onBack && (
        <Box>
          <Text color={isBackFocused ? "blue" : "gray"} bold={isBackFocused}>
            {isBackFocused ? "→ " : "  "}← back
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
