import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import { AI_PROVIDERS, AIProvider } from "../consts/ai-providers.js";
import { PreferencesStorage } from "../lib/preferences-storage.js";

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
          const provider = AI_PROVIDERS.find(p => p.id === preferences.selectedProvider);
          if (provider) {
            setSavedProvider(provider);
            const providerIndex = AI_PROVIDERS.findIndex(p => p.id === preferences.selectedProvider);
            setSelectedIndex(providerIndex >= 0 ? providerIndex : 0);
          }
        }
      } catch (error) {
        console.error('Error loading saved provider:', error);
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

      // Save the selected provider to preferences
      preferencesStorage.savePreferences({
        selectedProvider: selectedProvider.id
      }).catch(error => {
        console.error('Error saving provider preference:', error);
      });

      onSelect(selectedProvider);
    } else if (input === 't' && onTestMode) {
      onTestMode();
    } else if ((input === 'b' || key.escape) && onBack) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          Select AI Provider for Grading:
        </Text>
      </Box>
      {savedProvider && (
        <Box marginBottom={1}>
          <Text color="green">
            Previously selected: {savedProvider.name}
          </Text>
        </Box>
      )}
      <Box flexDirection="column">
        {AI_PROVIDERS.map((provider, index) => (
          <Box key={provider.id} marginBottom={1}>
            <Text color={index === selectedIndex ? "green" : "white"}>
              {index === selectedIndex ? "► " : "  "}
              {provider.name}
            </Text>
            <Text color="gray" dimColor>
              {" - "}
              {provider.description}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="yellow">
          Use ↑/↓ arrows to navigate, Enter to select, 't' for Browser Test Mode, 'b' to go back
        </Text>
      </Box>
    </Box>
  );
};