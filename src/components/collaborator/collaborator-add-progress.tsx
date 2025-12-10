import React, { useState, useEffect, useRef } from "react";
import { Text, Box, useInput } from "ink";
import Spinner from "ink-spinner";
import { GitHubService, AddCollaboratorResult } from "../../github/github-service.js";
import { HelpFooter, createHelpHints } from "../ui/HelpFooter.js";

export interface CollaboratorResults {
  success: Array<{ username: string; status?: string }>;
  failed: Array<{ username: string; error: string }>;
}

type UserStatus = "pending" | "adding" | "success" | "failed" | "skipped";

interface UserProgress {
  username: string;
  status: UserStatus;
  error?: string;
  invitationStatus?: string;
}

interface CollaboratorAddProgressProps {
  targetRepo: { owner: string; repo: string; fullName: string };
  usernames: string[];
  githubToken: string;
  onComplete: (results: CollaboratorResults) => void;
  onAbort?: () => void;
}

export const CollaboratorAddProgress: React.FC<CollaboratorAddProgressProps> = ({
  targetRepo,
  usernames,
  githubToken,
  onComplete,
}) => {
  const [userProgress, setUserProgress] = useState<UserProgress[]>(
    usernames.map((username) => ({ username, status: "pending" }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAborted, setIsAborted] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const viewportSize = 10;

  const completedCount = userProgress.filter(
    (u) => u.status === "success" || u.status === "failed" || u.status === "skipped"
  ).length;
  const isComplete = completedCount === usernames.length;

  const visibleStartIndex = scrollOffset;
  const visibleEndIndex = Math.min(scrollOffset + viewportSize, userProgress.length);
  const displayUsers = userProgress.slice(visibleStartIndex, visibleEndIndex);

  useEffect(() => {
    const addCollaborators = async () => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const service = new GitHubService(githubToken);

      const results = await service.addCollaboratorsBatch(
        targetRepo.owner,
        targetRepo.repo,
        usernames,
        (current, total, result) => {
          setCurrentIndex(current);
          setUserProgress((prev) => {
            const updated = [...prev];
            const userIndex = updated.findIndex((u) => u.username === result.username);
            if (userIndex !== -1) {
              updated[userIndex] = {
                ...updated[userIndex],
                status: result.success ? "success" : "failed",
                error: result.error,
                invitationStatus: result.status,
              };
            }

            let nextUserIndex = -1;
            if (current < total) {
              nextUserIndex = updated.findIndex(
                (u, idx) => idx > userIndex && u.status === "pending"
              );
              if (nextUserIndex !== -1) {
                updated[nextUserIndex] = {
                  ...updated[nextUserIndex],
                  status: "adding",
                };
              }
            }

            const activeIndex = nextUserIndex !== -1 ? nextUserIndex : userIndex;
            if (activeIndex >= scrollOffset + viewportSize - 2) {
              setScrollOffset(Math.max(0, activeIndex - viewportSize + 3));
            }
            setSelectedIndex(activeIndex);

            return updated;
          });
        },
        abortController.signal
      );

      const successResults = results
        .filter((r) => r.success)
        .map((r) => ({ username: r.username, status: r.status }));
      const failedResults = results
        .filter((r) => !r.success)
        .map((r) => ({ username: r.username, error: r.error || "Unknown error" }));

      onComplete({ success: successResults, failed: failedResults });
    };

    setUserProgress((prev) => {
      const updated = [...prev];
      if (updated.length > 0) {
        updated[0].status = "adding";
      }
      return updated;
    });

    addCollaborators();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [targetRepo, usernames, githubToken, onComplete]);

  useInput((input, key) => {
    if (input === "a" && !isComplete) {
      setIsAborted(true);
      abortControllerRef.current?.abort();
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      setSelectedIndex(newIndex);
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      }
    } else if (key.downArrow) {
      const newIndex = Math.min(userProgress.length - 1, selectedIndex + 1);
      setSelectedIndex(newIndex);
      if (newIndex >= scrollOffset + viewportSize) {
        setScrollOffset(newIndex - viewportSize + 1);
      }
    }
  });

  const getStatusIcon = (status: UserStatus): string => {
    switch (status) {
      case "pending":
        return "○";
      case "adding":
        return "◐";
      case "success":
        return "✓";
      case "failed":
        return "✗";
      case "skipped":
        return "";
      default:
        return "○";
    }
  };

  const getStatusColor = (status: UserStatus): string => {
    switch (status) {
      case "pending":
        return "gray";
      case "adding":
        return "cyan";
      case "success":
        return "green";
      case "failed":
        return "red";
      case "skipped":
        return "yellow";
      default:
        return "gray";
    }
  };

  const showScrollIndicatorTop = scrollOffset > 0;
  const showScrollIndicatorBottom = visibleEndIndex < userProgress.length;

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Adding Collaborators
      </Text>
      <Text dimColor>Repository: {targetRepo.fullName}</Text>
      <Text></Text>

      <Box marginBottom={1}>
        {!isComplete ? (
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text>
              {" "}
              Adding: {currentIndex}/{usernames.length} users
            </Text>
          </Box>
        ) : (
          <Text color="green">Complete! Added {currentIndex} users</Text>
        )}
      </Box>

      {isAborted && (
        <Box marginBottom={1}>
          <Text color="yellow">Aborting... remaining users will be skipped</Text>
        </Box>
      )}

      {showScrollIndicatorTop && <Text dimColor> ↑ more above</Text>}

      {displayUsers.map((user, displayIndex) => {
        const actualIndex = visibleStartIndex + displayIndex;
        const isSelected = selectedIndex === actualIndex;

        return (
          <Box key={user.username}>
            <Text color={isSelected ? "blue" : getStatusColor(user.status)} bold={isSelected}>
              {getStatusIcon(user.status)} {user.username}
            </Text>
            {user.status === "adding" && (
              <Text color="cyan">
                {" "}
                <Spinner type="dots" />
              </Text>
            )}
            {user.status === "success" && user.invitationStatus && (
              <Text dimColor> ({user.invitationStatus})</Text>
            )}
            {user.status === "failed" && user.error && isSelected && (
              <Text color="red"> - {user.error}</Text>
            )}
          </Box>
        );
      })}

      {showScrollIndicatorBottom && <Text dimColor> ↓ more below</Text>}

      <Text></Text>
      <HelpFooter
        hints={createHelpHints("navigate", ["abort", !isComplete])}
      />
    </Box>
  );
};
