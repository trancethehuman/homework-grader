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
  onChange,
}) => {
  return (
    <Box
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
      marginBottom={1}
    >
      <Text color={isFocused ? "white" : "gray"}>
        {value || (isFocused ? "" : placeholder)}
        {isFocused && <Text color="blue">█</Text>}
      </Text>
    </Box>
  );
};