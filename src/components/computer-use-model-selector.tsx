import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { COMPUTER_USE_MODELS, ComputerUseModel } from "../consts/ai-providers.js";
import { BackButton, useBackNavigation } from "./ui/back-button.js";

interface ComputerUseModelSelectorProps {
  onModelSelected: (model: ComputerUseModel) => void;
  onBack: () => void;
}

export const ComputerUseModelSelector: React.FC<ComputerUseModelSelectorProps> = ({
  onModelSelected,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { handleBackInput } = useBackNavigation(onBack, true);

  useInput((input, key) => {
    if (handleBackInput(input, key)) {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : COMPUTER_USE_MODELS.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < COMPUTER_USE_MODELS.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      onModelSelected(COMPUTER_USE_MODELS[selectedIndex]);
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        🤖 Select Computer Use Model
      </Text>
      <Text></Text>
      <Text>
        Browser testing requires a Computer Use compatible AI model.
      </Text>
      <Text dimColor>
        Choose the model that will control the browser automation:
      </Text>
      <Text></Text>

      {COMPUTER_USE_MODELS.map((model, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={model.id} marginBottom={1}>
            <Text color={isSelected ? "cyan" : "white"} bold={isSelected}>
              {isSelected ? "→ " : "  "}
              {model.name}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor>
                {model.description} ({model.provider})
              </Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      <Text color="cyan">
        Use ↑/↓ arrows to navigate, Enter to select
      </Text>
      <Text></Text>
      <BackButton onBack={onBack} isVisible={true} />
    </Box>
  );
};