import React from "react";
import { Text, Box } from "ink";

interface BackButtonProps {
  onBack: () => void;
  label?: string;
  isVisible?: boolean;
}

export const BackButton: React.FC<BackButtonProps> = ({
  onBack,
  label = "Back",
  isVisible = true,
}) => {
  if (!isVisible) return null;

  return (
    <Box marginBottom={1}>
      <Text dimColor>
        Press 'b' or Escape to go back{label !== "Back" && ` to ${label}`}
      </Text>
    </Box>
  );
};

export const useBackNavigation = (
  onBack: () => void, 
  enabled: boolean = true,
  disableCondition?: () => boolean
) => {
  return {
    handleBackInput: (input: string, key: any) => {
      if (!enabled) return false;
      
      // Check if back navigation should be disabled (e.g., when in input field)
      if (disableCondition && disableCondition()) return false;
      
      if (input === 'b' || key.escape) {
        onBack();
        return true;
      }
      return false;
    }
  };
};