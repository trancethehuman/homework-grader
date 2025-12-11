import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { GradingPrompt, getGradingPrompts } from "../consts/grading-prompts.js";
import { HelpFooter } from "./ui/HelpFooter.js";

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
  const [mode, setMode] = useState<"list" | "custom">("list");
  const [customPrompt, setCustomPrompt] = useState("");
  const [lastKeyWasEnter, setLastKeyWasEnter] = useState(false);
  const prompts = getGradingPrompts();
  const totalOptions = prompts.length + 1;

  useInput((input, key) => {
    if (mode === "custom") {
      if (key.escape) {
        setMode("list");
        setCustomPrompt("");
        setLastKeyWasEnter(false);
        return;
      }

      if (key.return) {
        if (lastKeyWasEnter && customPrompt.trim()) {
          onSelect({
            name: "Custom Prompt",
            description: "User-provided custom prompt",
            value: customPrompt.trim(),
          });
          return;
        }
        setCustomPrompt((prev) => prev + "\n");
        setLastKeyWasEnter(true);
        return;
      }

      setLastKeyWasEnter(false);

      if (key.backspace || key.delete) {
        setCustomPrompt((prev) => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setCustomPrompt((prev) => prev + input);
      }
      return;
    }

    if (showPreview) {
      if (key.return) {
        onSelect(prompts[selectedIndex]);
      } else if (key.escape) {
        setShowPreview(false);
      }
    } else {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
      } else if (key.return) {
        if (selectedIndex === prompts.length) {
          setMode("custom");
        } else {
          onSelect(prompts[selectedIndex]);
        }
      } else if (input === "p" && selectedIndex < prompts.length) {
        setShowPreview(true);
      } else if (key.escape) {
        onBack();
      }
    }
  });

  if (mode === "custom") {
    const lines = customPrompt.split("\n");
    const lineCount = lines.length;

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Enter Custom Prompt
        </Text>
        <Text></Text>
        <Text dimColor>
          Type or paste your prompt below. Press Enter twice to confirm.
        </Text>
        <Text></Text>
        <Box
          borderStyle="single"
          borderColor="cyan"
          flexDirection="column"
          paddingX={1}
          minHeight={5}
        >
          {lines.map((line, index) => (
            <Text key={index}>{line || " "}</Text>
          ))}
          <Text color="cyan">_</Text>
        </Box>
        <Text></Text>
        <Text dimColor>
          {lineCount} line{lineCount !== 1 ? "s" : ""} | {customPrompt.length} chars
        </Text>
        <Text></Text>
        <Box>
          <Text dimColor>Enter x2 to confirm</Text>
          <Text> | </Text>
          <Text dimColor>Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (showPreview) {
    const selectedPrompt = prompts[selectedIndex];
    const lines = selectedPrompt.value.split("\n");
    const previewLines = lines.slice(0, 30);
    const hasMore = lines.length > 30;

    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Prompt Preview: {selectedPrompt.name}
        </Text>
        <Text></Text>
        <Text color="gray" wrap="wrap">
          {selectedPrompt.description}
        </Text>
        <Text></Text>
        <Text color="yellow" bold>
          Preview (first 30 lines):
        </Text>
        <Text color="gray">{"─".repeat(60)}</Text>

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

        <Text color="gray">{"─".repeat(60)}</Text>
        <Text></Text>
        <Text color="green">Press Enter to select this prompt</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Grading Prompt
      </Text>
      <Text></Text>
      <Text>
        Choose the prompt that will be used to grade repository code:
      </Text>
      <Text></Text>
      {prompts.map((prompt, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
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
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text
            color={selectedIndex === prompts.length ? "blue" : "white"}
            bold={selectedIndex === prompts.length}
          >
            Custom Prompt...
          </Text>
        </Box>
        <Box marginLeft={4}>
          <Text color="gray" wrap="wrap">
            Type or paste your own custom grading prompt
          </Text>
        </Box>
      </Box>
      <Text></Text>
      <HelpFooter hints={[
        { keys: "p", action: "preview" },
        { keys: "Enter", action: "select" },
        { keys: "Esc", action: "back" },
      ]} />
    </Box>
  );
};