import React, { useState } from "react";
import { Text, Box, useInput } from "ink";
import { COMPUTER_USE_MODELS, ComputerUseModel } from "../consts/ai-providers.js";

interface ComputerUseModelSelectorProps {
  onModelSelected: (model: ComputerUseModel) => void;
  onBack: () => void;
}

export const ComputerUseModelSelector: React.FC<ComputerUseModelSelectorProps> = ({
  onModelSelected,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(COMPUTER_USE_MODELS.length - 1, prev + 1));
    } else if (key.return) {
      onModelSelected(COMPUTER_USE_MODELS[selectedIndex]);
    } else if (input === "b" || key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Select Computer Use Model
      </Text>
      <Text></Text>
      <Text>Browser testing requires a Computer Use compatible AI model.</Text>
      <Text dimColor>Use ↑/↓ arrows to navigate, Enter to select</Text>
      <Text></Text>

      {COMPUTER_USE_MODELS.map((model, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={model.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {isSelected ? "→ " : "  "}
                {model.name}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>
                {model.description} ({model.provider})
              </Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      <Text dimColor>Press 'b' or Escape to go back, Ctrl+C to exit</Text>
    </Box>
  );
};
