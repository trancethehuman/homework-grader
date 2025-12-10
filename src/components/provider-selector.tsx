import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { AI_PROVIDERS, AIProvider } from "../consts/ai-providers.js";
import { PreferencesStorage } from "../lib/preferences-storage.js";
import { HelpFooter } from "./ui/HelpFooter.js";

interface ProviderSelectorProps {
  onSelect: (provider: AIProvider) => void;
  onTestMode?: () => void;
  onBack?: () => void;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  onSelect,
  onTestMode,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [preferencesStorage] = useState(new PreferencesStorage());
  const [savedProvider, setSavedProvider] = useState<AIProvider | null>(null);

  useEffect(() => {
    const loadSavedProvider = async () => {
      try {
        const preferences = await preferencesStorage.loadPreferences();
        if (preferences.selectedProvider) {
          const provider = AI_PROVIDERS.find((p) => p.id === preferences.selectedProvider);
          if (provider) {
            setSavedProvider(provider);
            const providerIndex = AI_PROVIDERS.findIndex(
              (p) => p.id === preferences.selectedProvider
            );
            setSelectedIndex(providerIndex >= 0 ? providerIndex : 0);
          }
        }
      } catch {
        // Silently ignore preference loading errors
      }
    };

    loadSavedProvider();
  }, [preferencesStorage]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(AI_PROVIDERS.length - 1, prev + 1));
    } else if (key.return) {
      const selectedProvider = AI_PROVIDERS[selectedIndex];

      preferencesStorage
        .savePreferences({ selectedProvider: selectedProvider.id })
        .catch(() => {
          // Silently ignore preference saving errors
        });

      onSelect(selectedProvider);
    } else if (input === "t" && onTestMode) {
      onTestMode();
    } else if ((input === "b" || key.escape) && onBack) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text color="cyan" bold>
        Select AI Provider for Grading
      </Text>
      <Text></Text>
      {savedProvider && (
        <Text color="green" dimColor>
          Previously selected: {savedProvider.name}
        </Text>
      )}
      <Text></Text>

      {AI_PROVIDERS.map((provider, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={provider.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "blue" : "white"} bold={isSelected}>
                {provider.name}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text dimColor>{provider.description}</Text>
            </Box>
          </Box>
        );
      })}

      <Text></Text>
      <HelpFooter
        hints={[
          { keys: "↑/↓", action: "navigate" },
          { keys: "Enter", action: "select" },
          { keys: "'t'", action: "test mode", condition: !!onTestMode },
          { keys: "'b'", action: "back", condition: !!onBack },
          { keys: "Ctrl+C", action: "exit" },
        ]}
      />
    </Box>
  );
};
