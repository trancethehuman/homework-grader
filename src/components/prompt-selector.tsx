import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { GradingPrompt, getGradingPrompts } from "../consts/grading-prompts.js";

interface PromptSelectorProps {
  onSelect: (prompt: GradingPrompt) => void;
  onBack: () => void;
}

export const PromptSelector: React.FC<PromptSelectorProps> = ({
  onSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const prompts = getGradingPrompts();

  useInput((input, key) => {
    if (showPreview) {
      if (key.return) {
        onSelect(prompts[selectedIndex]);
      } else if (input === "b" || key.escape) {
        setShowPreview(false);
      }
    } else {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prompts.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < prompts.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        onSelect(prompts[selectedIndex]);
      } else if (input === "p") {
        setShowPreview(true);
      } else if (input === "b" || key.escape) {
        onBack();
      }
    }
  });

  if (showPreview) {
    const selectedPrompt = prompts[selectedIndex];
    const lines = selectedPrompt.value.split('\n');
    const previewLines = lines.slice(0, 30); // Show first 30 lines
    const hasMore = lines.length > 30;

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          📄 Prompt Preview: {selectedPrompt.name}
        </Text>
        <Text></Text>
        <Text color="gray" wrap="wrap">
          {selectedPrompt.description}
        </Text>
        <Text></Text>
        <Text color="yellow" bold>
          Preview (first 30 lines):
        </Text>
        <Text color="gray">{'─'.repeat(60)}</Text>

        {previewLines.map((line, index) => (
          <Text key={index} wrap="wrap">
            {line}
          </Text>
        ))}

        {hasMore && (
          <Text color="gray" italic>
            ... (preview truncated, {lines.length - 30} more lines)
          </Text>
        )}

        <Text color="gray">{'─'.repeat(60)}</Text>
        <Text></Text>
        <Text color="green">Press Enter to select this prompt</Text>
        <Text color="yellow">Press 'b' or Esc to go back to selection</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        📝 Select Grading Prompt
      </Text>
      <Text></Text>
      <Text>
        Choose the prompt that will be used to grade repository code:
      </Text>
      <Text></Text>
      <Text color="cyan">Use ↑/↓ arrows to navigate, Enter to select:</Text>
      <Text></Text>

      {prompts.map((prompt, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {prompt.name}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text color="gray" wrap="wrap">
                {prompt.description}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      <Text color="cyan">Commands:</Text>
      <Text color="green">• Enter = select prompt</Text>
      <Text color="yellow">• 'p' = preview selected prompt</Text>
      <Text color="red">• 'b' or Esc = go back</Text>
    </Box>
  );
};