import React from "react";
import { Text, Box } from "ink";
import * as fs from "fs";
import * as path from "path";
import { useTextInput } from "../hooks/useTextInput.js";

interface LocalRepoPathInputProps {
  onSubmit: (repoPath: string) => void;
  onBack: () => void;
  currentDirectory: string;
}

export const LocalRepoPathInput: React.FC<LocalRepoPathInputProps> = ({
  onSubmit,
  onBack,
  currentDirectory,
}) => {
  const validatePath = (inputPath: string): { valid: boolean; message?: string } => {
    const pathToValidate = inputPath.trim() || currentDirectory;
    const resolvedPath = path.resolve(pathToValidate);

    if (!fs.existsSync(resolvedPath)) {
      return { valid: false, message: "Path does not exist" };
    }

    const stats = fs.statSync(resolvedPath);
    if (!stats.isDirectory()) {
      return { valid: false, message: "Path must be a directory" };
    }

    return { valid: true };
  };

  const { input, error } = useTextInput({
    onSubmit: (value) => {
      const pathToSubmit = value.trim() || currentDirectory;
      onSubmit(path.resolve(pathToSubmit));
    },
    onBack,
    validate: validatePath,
    allowBackWhenEmpty: true,
  });

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Enter Local Repository Path
      </Text>
      <Text></Text>
      <Text>Enter the path to your local repository:</Text>
      <Text dimColor>Current directory: {currentDirectory}</Text>
      <Text></Text>

      <Box>
        <Text color="cyan">Path: </Text>
        <Text>{input}</Text>
        <Text inverse> </Text>
      </Box>

      {error && (
        <>
          <Text></Text>
          <Text color="red">✗ {error}</Text>
        </>
      )}

      <Text></Text>
      <Text dimColor>Tip: Press Enter without typing to use current directory</Text>
      <Text dimColor>     You can also use relative paths (e.g., ./my-repo or ../other-repo)</Text>
      <Text dimColor>Press Enter to continue, 'b' to go back (when input is empty)</Text>
      <Text dimColor>Press Ctrl+C to exit</Text>
    </Box>
  );
};
