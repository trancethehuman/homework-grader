import React from "react";
import { Text, Box } from "ink";

interface SearchInputProps {
  value: string;
  placeholder?: string;
  isFocused: boolean;
  onChange: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  placeholder = "Search...",
  isFocused,
}) => {
  // Always render some content to prevent layout shifts when typing starts
  // Use a zero-width space as fallback when value is empty to maintain consistent height
  const displayValue = value || (isFocused ? "\u200B" : placeholder);

  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={isFocused ? "white" : "gray"}>
        {displayValue}
        {isFocused && <Text color="blue">█</Text>}
      </Text>
    </Box>
  );
};