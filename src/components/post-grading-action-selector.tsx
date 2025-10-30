import React, { useState } from 'react';
import { Box, Text } from 'ink';

export type PostGradingAction = 'notion' | 'github-issues' | 'both' | 'skip';

interface PostGradingActionSelectorProps {
  successCount: number;
  onSelect: (action: PostGradingAction) => void;
}

export const PostGradingActionSelector: React.FC<PostGradingActionSelectorProps> = ({
  successCount,
  onSelect,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options: { value: PostGradingAction; label: string; description: string }[] = [
    {
      value: 'notion',
      label: 'Save to Notion Database',
      description: 'Save grading results to a Notion database',
    },
    {
      value: 'github-issues',
      label: 'Send as GitHub Issues',
      description: 'Create GitHub issues in each repository with feedback',
    },
    {
      value: 'both',
      label: 'Both (Notion + GitHub Issues)',
      description: 'Save to Notion and create GitHub issues',
    },
    {
      value: 'skip',
      label: 'Skip',
      description: 'Do not save results anywhere',
    },
  ];

  React.useEffect(() => {
    const handleInput = (data: string) => {
      const key = data.toString();

      if (key === '\u001B[A') {
        // Up arrow
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      } else if (key === '\u001B[B') {
        // Down arrow
        setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      } else if (key === '\r') {
        // Enter
        onSelect(options[selectedIndex].value);
      } else if (key.toLowerCase() === 'n') {
        // Quick select Notion
        onSelect('notion');
      } else if (key.toLowerCase() === 'g') {
        // Quick select GitHub Issues
        onSelect('github-issues');
      } else if (key.toLowerCase() === 'b') {
        // Quick select Both
        onSelect('both');
      } else if (key.toLowerCase() === 's') {
        // Quick select Skip
        onSelect('skip');
      }
    };

    process.stdin.on('data', handleInput);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    return () => {
      process.stdin.off('data', handleInput);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
    };
  }, [selectedIndex, onSelect, options]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="green">
          ✅ Grading completed successfully for {successCount}{' '}
          {successCount === 1 ? 'repository' : 'repositories'}!
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>What would you like to do with the results?</Text>
      </Box>

      {options.map((option, index) => (
        <Box key={option.value} marginLeft={2}>
          <Text color={index === selectedIndex ? 'blue' : undefined} bold={index === selectedIndex}>
            {index === selectedIndex ? '→ ' : '  '}
            {option.label}
          </Text>
          <Text dimColor> - {option.description}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text dimColor>
          Use ↑↓ arrows to navigate, Enter to select, or press n/g/b/s for quick selection
        </Text>
      </Box>
    </Box>
  );
};
