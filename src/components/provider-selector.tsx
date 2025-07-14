import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AI_PROVIDERS, AIProvider } from "../consts/ai-providers.js";

interface ProviderSelectorProps {
  onSelect: (provider: AIProvider) => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  onSelect,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(AI_PROVIDERS.length - 1, prev + 1));
    } else if (key.return) {
      onSelect(AI_PROVIDERS[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Select AI Provider for Grading:
        </Text>
      </Box>
      <Box flexDirection="column">
        {AI_PROVIDERS.map((provider, index) => (
          <Box key={provider.id} marginBottom={1}>
            <Text color={index === selectedIndex ? "green" : "white"}>
              {index === selectedIndex ? "► " : "  "}
              {provider.name}
            </Text>
            <Text color="gray" dimColor>
              {" - "}
              {provider.description}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">
          Use ↑/↓ arrows to navigate, Enter to select
        </Text>
      </Box>
    </Box>
  );
};