import React, { useState, useEffect } from "react";
import { Text, Box } from "ink";
import { BrowserTestingService, BrowserTestResult } from "../lib/stagehand/browser-testing-service.js";
import { BackButton, useBackNavigation } from "./ui/back-button.js";
import { ComputerUseModel, DEFAULT_COMPUTER_USE_MODEL } from "../consts/ai-providers.js";

interface BrowserTestModeProps {
  selectedModel: ComputerUseModel | null;
  onBack: () => void;
}

const TEST_URLS = [
  { url: "https://browserbase.com", pageId: "test-1" },
  { url: "https://stagehand.dev", pageId: "test-2" },
  { url: "https://browser-use.com", pageId: "test-3" }
];

export const BrowserTestMode: React.FC<BrowserTestModeProps> = ({ selectedModel, onBack }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<BrowserTestResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, active: [] as string[] });

  const { handleBackInput } = useBackNavigation(onBack, true);

  useEffect(() => {
    const initializeAndTest = async () => {
      try {
        setIsInitializing(true);
        setError(null);

        const browserService = new BrowserTestingService(
          undefined, 
          undefined, 
          undefined, 
          selectedModel || DEFAULT_COMPUTER_USE_MODEL
        );
        
        if (!browserService.isConfigured()) {
          setError("Browserbase API key and project ID are required. Please set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables.");
          setIsInitializing(false);
          return;
        }

        await browserService.initialize();
        setIsInitializing(false);
        setIsTesting(true);

        const testResults = await browserService.testDeployedUrls(
          TEST_URLS,
          (progressUpdate) => {
            setProgress({
              completed: progressUpdate.completedUrls,
              total: progressUpdate.totalUrls,
              active: progressUpdate.activeUrls
            });
          }
        );

        setResults(testResults);
        setIsTesting(false);

        await browserService.cleanup();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(`Browser test failed: ${errorMsg}`);
        setIsInitializing(false);
        setIsTesting(false);
      }
    };

    initializeAndTest();
  }, []);

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          🚫 Browser Test Mode Error
        </Text>
        <Text></Text>
        <Text color="red">{error}</Text>
        <Text></Text>
        <BackButton onBack={onBack} isVisible={true} />
      </Box>
    );
  }

  if (isInitializing) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🌐 Browser Test Mode
        </Text>
        <Text></Text>
        <Text>Initializing Browserbase session...</Text>
        <Text dimColor>Setting up cloud browser infrastructure</Text>
        <Text></Text>
        <BackButton onBack={onBack} isVisible={true} />
      </Box>
    );
  }

  if (isTesting) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🌐 Browser Test Mode - Testing in Progress
        </Text>
        <Text></Text>
        <Text>
          Testing {TEST_URLS.length} URLs with browser automation...
        </Text>
        <Text>
          Progress: {progress.completed}/{progress.total} URLs completed
        </Text>
        <Text></Text>
        
        {progress.active.length > 0 && (
          <>
            <Text color="cyan">Currently testing:</Text>
            {progress.active.map((url, index) => (
              <Text key={index} dimColor>  • {url}</Text>
            ))}
            <Text></Text>
          </>
        )}

        {results.length > 0 && (
          <>
            <Text color="green">Completed tests:</Text>
            {results.map((result, index) => (
              <Text key={index} color={result.success ? "green" : "red"}>
                {result.success ? "✓" : "✗"} {result.url} ({result.duration}ms)
              </Text>
            ))}
            <Text></Text>
          </>
        )}
        
        <BackButton onBack={onBack} isVisible={true} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        🌐 Browser Test Mode - Results
      </Text>
      <Text></Text>
      <Text>
        Completed testing {results.length} URLs
      </Text>
      <Text>
        Successful: {results.filter(r => r.success).length}, Failed: {results.filter(r => !r.success).length}
      </Text>
      <Text></Text>

      {results.map((result, index) => {
        const statusColor = result.success ? "green" : "red";
        const statusIcon = result.success ? "✓" : "✗";

        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text color={statusColor} bold>
              {statusIcon} {result.url}
            </Text>
            <Box marginLeft={2}>
              <Text dimColor>Duration: {result.duration}ms</Text>
              <Text dimColor> | Actions: {result.actions.length}</Text>
              <Text dimColor> | Screenshots: {result.screenshots.length}</Text>
            </Box>
            {result.errors.length > 0 && (
              <Box marginLeft={2}>
                <Text color="red">Errors:</Text>
                {result.errors.slice(0, 2).map((error, errorIndex) => (
                  <Text key={errorIndex} color="red" dimColor>  • {error}</Text>
                ))}
                {result.errors.length > 2 && (
                  <Text color="red" dimColor>  ... and {result.errors.length - 2} more errors</Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}

      <Text></Text>
      <Text color="cyan">
        Test completed! Press Escape to return to provider selection.
      </Text>
      <Text></Text>
      <BackButton onBack={onBack} isVisible={true} />
    </Box>
  );
};