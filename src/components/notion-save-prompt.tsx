import React, { useState } from "react";
import { Box, Text } from "ink";

interface NotionSavePromptProps {
  onYes: () => void;
  onNo: () => void;
}

export const NotionSavePrompt: React.FC<NotionSavePromptProps> = ({
  onYes,
  onNo,
}) => {
  const [selectedOption, setSelectedOption] = useState<"yes" | "no">("yes");

  React.useEffect(() => {
    const handleInput = (char: string, key: any) => {
      if (key.leftArrow || key.rightArrow) {
        setSelectedOption((prev) => (prev === "yes" ? "no" : "yes"));
      } else if (key.return) {
        if (selectedOption === "yes") {
          onYes();
        } else {
          onNo();
        }
      } else if (char === "y" || char === "Y") {
        onYes();
      } else if (char === "n" || char === "N") {
        onNo();
      }
    };

    process.stdin.on("keypress", handleInput);
    return () => {
      process.stdin.off("keypress", handleInput);
    };
  }, [selectedOption, onYes, onNo]);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Would you like to save the grading results to Notion?</Text>
      <Box marginTop={1} gap={2}>
        <Text color={selectedOption === "yes" ? "blue" : "white"}>
          {selectedOption === "yes" ? "→ " : "  "}
          [Y]es
        </Text>
        <Text color={selectedOption === "no" ? "blue" : "white"}>
          {selectedOption === "no" ? "→ " : "  "}
          [N]o
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Use arrow keys or Y/N to select, Enter to confirm</Text>
      </Box>
    </Box>
  );
};
