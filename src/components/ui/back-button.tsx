import React from "react";

interface BackButtonProps {
  onBack: () => void;
  label?: string;
  isVisible?: boolean;
}

export const BackButton: React.FC<BackButtonProps> = () => {
  return null;
};

export const useBackNavigation = (
  onBack: () => void, 
  enabled: boolean = true,
  disableCondition?: () => boolean
) => {
  return {
    handleBackInput: (_input: string, key: any) => {
      if (!enabled) return false;
      
      // Check if back navigation should be disabled (e.g., when in input field)
      if (disableCondition && disableCondition()) return false;
      
      if (key.escape) {
        onBack();
        return true;
      }
      return false;
    }
  };
};