import { useState, useCallback } from "react";
import { useInput } from "ink";

export interface ValidationResult {
  valid: boolean;
  message?: string;
  value?: any;
}

export interface UseTextInputOptions {
  initialValue?: string;
  onSubmit: (value: string) => void;
  onBack?: () => void;
  validate?: (value: string) => ValidationResult;
  allowBackWhenEmpty?: boolean;
  filter?: (char: string) => boolean;
}

export interface UseTextInputResult {
  input: string;
  setInput: (value: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Hook for managing text input with keyboard navigation.
 * Handles character input, backspace, Enter to submit, and back navigation.
 */
export function useTextInput({
  initialValue = "",
  onSubmit,
  onBack,
  validate,
  allowBackWhenEmpty = true,
  filter,
}: UseTextInputOptions): UseTextInputResult {
  const [input, setInput] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (validate) {
      const validation = validate(input);
      if (!validation.valid) {
        setError(validation.message || "Invalid input");
        return;
      }
      onSubmit(validation.value ?? input);
    } else {
      onSubmit(input);
    }
  }, [input, validate, onSubmit]);

  useInput((char, key) => {
    if (key.return) {
      handleSubmit();
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
    } else if (allowBackWhenEmpty && input === "" && (char === "b" || key.escape) && onBack) {
      onBack();
    } else if (char && !key.ctrl && !key.meta) {
      if (!filter || filter(char)) {
        setInput((prev) => prev + char);
        setError(null);
      }
    }
  });

  return {
    input,
    setInput,
    error,
    setError,
    clearError,
  };
}
