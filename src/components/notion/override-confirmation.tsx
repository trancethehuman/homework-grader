import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { ConflictDetectionResult, OverrideDecision, FieldConflict } from "../../lib/notion/conflict-detector.js";

export interface OverrideConfirmationProps {
  conflicts: ConflictDetectionResult[];
  onDecision: (decisions: Map<string, OverrideDecision[]>) => void;
  onCancel: () => void;
}

type BulkAction = 'replace-all' | 'keep-all' | 'detailed' | 'cancel';
type FieldAction = 'keep' | 'replace' | 'skip';

export const OverrideConfirmation: React.FC<OverrideConfirmationProps> = ({
  conflicts,
  onDecision,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showDetailedView, setShowDetailedView] = useState(false);
  const [currentRepositoryIndex, setCurrentRepositoryIndex] = useState(0);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [fieldDecisions, setFieldDecisions] = useState<Map<string, Map<string, FieldAction>>>(new Map());

  const bulkOptions: Array<{ key: BulkAction; label: string; description: string }> = [
    {
      key: 'replace-all',
      label: 'Replace all existing data',
      description: 'Overwrite all existing values with new grading results'
    },
    {
      key: 'keep-all',
      label: 'Keep all existing data',
      description: 'Skip updates for all fields that already have data'
    },
    {
      key: 'detailed',
      label: 'Choose field by field',
      description: 'Review each conflict individually and decide'
    },
    {
      key: 'cancel',
      label: 'Cancel save operation',
      description: 'Don\'t save to Notion database'
    }
  ];

  const fieldOptions: Array<{ key: FieldAction; label: string; description: string }> = [
    {
      key: 'replace',
      label: 'Replace with new value',
      description: 'Overwrite the existing data'
    },
    {
      key: 'keep',
      label: 'Keep existing value',
      description: 'Don\'t change the current data'
    },
    {
      key: 'skip',
      label: 'Skip this field',
      description: 'Don\'t update this field for this repository'
    }
  ];

  const repositoriesWithConflicts = conflicts.filter(c => c.hasConflicts);
  const totalConflicts = repositoriesWithConflicts.reduce((sum, repo) => sum + repo.conflicts.length, 0);

  useInput((input, key) => {
    if (!showDetailedView) {
      // Bulk action selection
      if (key.upArrow && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      } else if (key.downArrow && selectedIndex < bulkOptions.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else if (key.return) {
        const selected = bulkOptions[selectedIndex];
        if (selected.key === 'detailed') {
          setShowDetailedView(true);
          setCurrentRepositoryIndex(0);
          setCurrentFieldIndex(0);
        } else {
          handleBulkAction(selected.key);
        }
      }
    } else {
      // Detailed field-by-field selection
      const currentRepo = repositoriesWithConflicts[currentRepositoryIndex];
      if (!currentRepo) return;

      const currentField = currentRepo.conflicts[currentFieldIndex];
      if (!currentField) return;

      if (key.upArrow && currentFieldIndex > 0) {
        setCurrentFieldIndex(currentFieldIndex - 1);
      } else if (key.downArrow && currentFieldIndex < fieldOptions.length - 1) {
        setCurrentFieldIndex(currentFieldIndex + 1);
      } else if (key.return) {
        const selectedAction = fieldOptions[currentFieldIndex].key;
        recordFieldDecision(currentRepo.pageId, currentField.fieldName, selectedAction);
        moveToNextConflict();
      } else if (key.backspace) {
        // Go back to bulk selection
        setShowDetailedView(false);
        setSelectedIndex(0);
      }
    }
  });

  const handleBulkAction = (action: BulkAction) => {
    const decisions = new Map<string, OverrideDecision[]>();

    switch (action) {
      case 'replace-all':
        repositoriesWithConflicts.forEach(repo => {
          const repoDecisions = repo.conflicts.map(conflict => ({
            fieldName: conflict.fieldName,
            action: 'replace' as const
          }));
          decisions.set(repo.pageId, repoDecisions);
        });
        onDecision(decisions);
        break;

      case 'keep-all':
        repositoriesWithConflicts.forEach(repo => {
          const repoDecisions = repo.conflicts.map(conflict => ({
            fieldName: conflict.fieldName,
            action: 'keep' as const
          }));
          decisions.set(repo.pageId, repoDecisions);
        });
        onDecision(decisions);
        break;

      case 'cancel':
        onCancel();
        break;
    }
  };

  const recordFieldDecision = (pageId: string, fieldName: string, action: FieldAction) => {
    const newDecisions = new Map(fieldDecisions);
    if (!newDecisions.has(pageId)) {
      newDecisions.set(pageId, new Map());
    }
    newDecisions.get(pageId)!.set(fieldName, action);
    setFieldDecisions(newDecisions);
  };

  const moveToNextConflict = () => {
    const currentRepo = repositoriesWithConflicts[currentRepositoryIndex];
    const nextFieldIndex = currentFieldIndex + 1;

    if (nextFieldIndex < currentRepo.conflicts.length) {
      // More fields in current repository
      setCurrentFieldIndex(nextFieldIndex);
    } else {
      // Move to next repository
      const nextRepoIndex = currentRepositoryIndex + 1;
      if (nextRepoIndex < repositoriesWithConflicts.length) {
        setCurrentRepositoryIndex(nextRepoIndex);
        setCurrentFieldIndex(0);
      } else {
        // All conflicts resolved, apply decisions
        applyDetailedDecisions();
      }
    }
  };

  const applyDetailedDecisions = () => {
    const decisions = new Map<string, OverrideDecision[]>();

    fieldDecisions.forEach((repoDecisions, pageId) => {
      const repoOverrides: OverrideDecision[] = [];
      repoDecisions.forEach((action, fieldName) => {
        repoOverrides.push({ fieldName, action });
      });
      decisions.set(pageId, repoOverrides);
    });

    onDecision(decisions);
  };

  const getProgressText = () => {
    if (!showDetailedView) return '';

    const completedDecisions = Array.from(fieldDecisions.values())
      .reduce((sum, repoDecisions) => sum + repoDecisions.size, 0);

    return `Progress: ${completedDecisions}/${totalConflicts} conflicts resolved`;
  };

  if (repositoriesWithConflicts.length === 0) {
    // No conflicts, proceed with save
    onDecision(new Map());
    return null;
  }

  if (showDetailedView) {
    const currentRepo = repositoriesWithConflicts[currentRepositoryIndex];
    const currentField = currentRepo?.conflicts[currentFieldIndex];

    if (!currentRepo || !currentField) {
      return (
        <Box flexDirection="column" marginY={1}>
          <Text color="green">✅ All conflicts resolved!</Text>
        </Box>
      );
    }

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow" bold>
          ⚠️  Data Conflict Detected
        </Text>
        <Text></Text>

        <Text color="cyan">
          Repository: {currentRepo.repositoryName}
        </Text>
        <Text color="cyan">
          Field: {currentField.displayName}
        </Text>
        <Text></Text>

        <Text>Existing value:</Text>
        <Text color="gray" wrap="wrap">
          "{currentField.existingValue}"
        </Text>
        <Text></Text>

        <Text>New value:</Text>
        <Text color="green" wrap="wrap">
          "{currentField.newValue}"
        </Text>
        <Text></Text>

        <Text>What would you like to do?</Text>
        <Text></Text>

        {fieldOptions.map((option, index) => (
          <Box key={option.key} marginY={0}>
            <Text color={index === currentFieldIndex ? "cyan" : "white"}>
              {index === currentFieldIndex ? "→ " : "  "}
              {option.label}
            </Text>
          </Box>
        ))}

        <Text></Text>
        <Text color="gray" dimColor>
          {fieldOptions[currentFieldIndex]?.description}
        </Text>
        <Text></Text>
        <Text color="gray" dimColor>
          {getProgressText()}
        </Text>
        <Text color="gray" dimColor>
          [Use arrow keys, Enter to select, Backspace to go back]
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="yellow" bold>
        ⚠️  Data Conflicts Detected
      </Text>
      <Text></Text>

      <Text>
        Found {totalConflicts} field conflicts across {repositoriesWithConflicts.length} repositories.
      </Text>
      <Text>
        These repositories already have grading data that would be overwritten.
      </Text>
      <Text></Text>

      <Text>Conflicts summary:</Text>
      {repositoriesWithConflicts.slice(0, 3).map(repo => (
        <Text key={repo.pageId} color="gray" dimColor>
          • {repo.repositoryName}: {repo.conflicts.length} field{repo.conflicts.length !== 1 ? 's' : ''}
        </Text>
      ))}
      {repositoriesWithConflicts.length > 3 && (
        <Text color="gray" dimColor>
          • ... and {repositoriesWithConflicts.length - 3} more repositories
        </Text>
      )}
      <Text></Text>

      <Text>How would you like to proceed?</Text>
      <Text></Text>

      {bulkOptions.map((option, index) => (
        <Box key={option.key} marginY={0}>
          <Text color={index === selectedIndex ? "cyan" : "white"}>
            {index === selectedIndex ? "→ " : "  "}
            {option.label}
          </Text>
        </Box>
      ))}

      <Text></Text>
      <Text color="gray" dimColor>
        {bulkOptions[selectedIndex]?.description}
      </Text>
      <Text></Text>
      <Text color="gray" dimColor>
        [Use arrow keys to navigate, press Enter to select]
      </Text>
    </Box>
  );
};