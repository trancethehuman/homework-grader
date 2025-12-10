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
  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
      flexGrow={1}
    >
      <Text color="white">{value}</Text>
      {isFocused && <Text color="blue">█</Text>}
      {!value && <Text color="gray">{placeholder}</Text>}
    </Box>
  );
};
