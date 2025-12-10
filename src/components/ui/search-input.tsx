import React from "react";
import { Text, Box } from "ink";

interface SearchInputProps {
  value: string;
  placeholder?: string;
  isFocused: boolean;
  onChange: (value: string) => void;
  minWidth?: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  placeholder = "Search...",
  isFocused,
  minWidth = 40,
}) => {
  const displayText = value || placeholder;
  const isShowingPlaceholder = !value;

  // Pad the display to maintain minimum width
  const paddedText = displayText.padEnd(minWidth, ' ');

  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
    >
      <Text color={isShowingPlaceholder ? "gray" : "white"}>
        {paddedText}
      </Text>
      {isFocused && <Text color="blue">█</Text>}
    </Box>
  );
};