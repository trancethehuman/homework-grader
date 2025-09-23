import React, { useState } from "react";
import { Text, Box, useInput } from "ink";

export interface SimpleOverrideConfirmationProps {
  existingFields: string[];
  onDecision: (shouldOverride: boolean) => void;
  onCancel: () => void;
}

export const SimpleOverrideConfirmation: React.FC<SimpleOverrideConfirmationProps> = ({
  existingFields,
  onDecision,
  onCancel,
}) => {
  const [selectedOption, setSelectedOption] = useState(0);

  const options = [
    {
      key: 'yes',
      label: 'Yes, override existing data',
      description: 'Overwrite existing grading data with new results'
    },
    {
      key: 'no',
      label: 'No, skip existing entries',
      description: 'Only create new entries, skip updating existing rows'
    },
    {
      key: 'cancel',
      label: 'Cancel',
      description: 'Don\'t save to Notion database'
    }
  ];

  useInput((input, key) => {
    if (key.upArrow && selectedOption > 0) {
      setSelectedOption(selectedOption - 1);
    } else if (key.downArrow && selectedOption < options.length - 1) {
      setSelectedOption(selectedOption + 1);
    } else if (key.return) {
      const selectedKey = options[selectedOption].key;
      if (selectedKey === 'yes') {
        onDecision(true);
      } else if (selectedKey === 'no') {
        onDecision(false);
      } else if (selectedKey === 'cancel') {
        onCancel();
      }
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="yellow" bold>
        ⚠️  Existing Grading Fields Detected
      </Text>
      <Text></Text>

      <Text>
        The following grading fields already exist in the database:
      </Text>
      <Text color="cyan">
        {existingFields.join(', ')}
      </Text>
      <Text></Text>

      <Text>
        These fields may contain existing grading data. What would you like to do?
      </Text>
      <Text></Text>

      {options.map((option, index) => (
        <Box key={option.key} flexDirection="column" marginBottom={1}>
          <Text color={selectedOption === index ? "cyan" : "white"} bold={selectedOption === index}>
            {selectedOption === index ? "→ " : "  "}{option.label}
          </Text>
          <Box marginLeft={4}>
            <Text color="gray">
              {option.description}
            </Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          [Use arrow keys to navigate, press Enter to select]
        </Text>
      </Box>
    </Box>
  );
};