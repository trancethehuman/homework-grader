import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

interface NotionSavePromptProps {
  successCount: number;
  onDecision: (saveToNotion: boolean) => void;
}

export const NotionSavePrompt: React.FC<NotionSavePromptProps> = ({
  successCount,
  onDecision,
}) => {
  const [selectedOption, setSelectedOption] = useState<"yes" | "no">("yes");

  useInput((input, key) => {
    if (key.upArrow || key.downArrow) {
      setSelectedOption((prev) => (prev === "yes" ? "no" : "yes"));
    } else if (key.return) {
      onDecision(selectedOption === "yes");
    } else if (input === "y" || input === "Y") {
      onDecision(true);
    } else if (input === "n" || input === "N") {
      onDecision(false);
    }
  });

  return (
    <Box flexDirection="column">
      <Text></Text>
      <Text color="blue" bold>
        Save Results to Notion?
      </Text>
      <Text></Text>
      <Text>
        You have {successCount} successfully graded{" "}
        {successCount === 1 ? "repository" : "repositories"}.
      </Text>
      <Text dimColor>Would you like to save these results to a Notion database?</Text>
      <Text></Text>

      <Box flexDirection="column">
        <Box>
          <Text color={selectedOption === "yes" ? "cyan" : "gray"} bold={selectedOption === "yes"}>
            Yes, save to Notion
          </Text>
        </Box>
        <Box>
          <Text color={selectedOption === "no" ? "cyan" : "gray"} bold={selectedOption === "no"}>
            No, skip saving
          </Text>
        </Box>
      </Box>
    </Box>
  );
};
