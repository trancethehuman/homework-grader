import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { BrowserTestingService, BrowserTestResult, BrowserTestingProgress } from "../lib/stagehand/browser-testing-service.js";
import { BROWSER_TESTING_CONFIG } from "../consts/deployed-url-patterns.js";
import { BackButton } from "./ui/back-button.js";

interface BrowserTestingProps {
  deployedUrls: Array<{ url: string; pageId?: string }>;
  onComplete: (results: BrowserTestResult[]) => void;
  onBack?: () => void;
  onError: (error: string) => void;
}

export const BrowserTesting: React.FC<BrowserTestingProps> = ({
  deployedUrls,
  onComplete,
  onBack,
  onError,
}) => {
  const [browserService] = useState(new BrowserTestingService());
  const [isInitializing, setIsInitializing] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [progress, setProgress] = useState<BrowserTestingProgress>({
    totalUrls: deployedUrls.length,
    completedUrls: 0,
    activeUrls: [],
    results: []
  });
  const [canTerminate, setCanTerminate] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      try {
        setIsInitializing(true);
        
        // Check if browser testing is configured
        if (!browserService.isConfigured()) {
          setIsConfigured(false);
          setIsInitializing(false);
          return;
        }
        
        setIsConfigured(true);
        await browserService.initialize();
        setIsInitializing(false);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to initialize browser testing:", errorMessage);
        onError(`Failed to initialize browser testing: ${errorMessage}`);
      }
    };

    initialize();
  }, [browserService, onError]);

  const startTesting = async () => {
    if (!isConfigured) {
      onError("Browser testing is not configured. Please set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables.");
      return;
    }

    try {
      setIsTesting(true);
      setCanTerminate(true);
      
      const results = await browserService.testDeployedUrls(deployedUrls, (progressUpdate) => {
        setProgress(progressUpdate);
      });

      setCanTerminate(false);
      console.log("Browser testing completed successfully");
      onComplete(results);
    } catch (error) {
      setCanTerminate(false);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Browser testing failed:", errorMessage);
      onError(`Browser testing failed: ${errorMessage}`);
    } finally {
      setIsTesting(false);
      // Cleanup
      try {
        await browserService.cleanup();
      } catch (cleanupError) {
        console.warn("Warning during browser service cleanup:", cleanupError);
      }
    }
  };

  const terminateTesting = async () => {
    if (canTerminate) {
      try {
        await browserService.cleanup();
        setCanTerminate(false);
        setIsTesting(false);
        console.log("Browser testing terminated by user");
        onBack?.();
      } catch (error) {
        console.warn("Warning during browser testing termination:", error);
      }
    }
  };

  useInput(async (input, key) => {
    if (input === 'c' && canTerminate) {
      await terminateTesting();
    } else if (key.return && !isInitializing && !isTesting && isConfigured) {
      await startTesting();
    } else if (input === 's' && !isInitializing && !isTesting) {
      // Skip browser testing
      onBack?.();
    }
  });

  if (isInitializing) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🌐 Browser Testing Setup
        </Text>
        <Text></Text>
        <Text color="yellow">Initializing Browserbase connection...</Text>
        <Text dimColor>Please wait while we set up browser testing...</Text>
      </Box>
    );
  }

  if (!isConfigured) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          🌐 Browser Testing Not Configured
        </Text>
        <Text></Text>
        <Text>
          Browser testing requires Browserbase credentials to be configured.
        </Text>
        <Text></Text>
        <Text color="yellow">Required environment variables:</Text>
        <Text dimColor>• BROWSERBASE_API_KEY - Your Browserbase API key</Text>
        <Text dimColor>• BROWSERBASE_PROJECT_ID - Your Browserbase project ID</Text>
        <Text></Text>
        <Text dimColor>
          Get your credentials at: https://browserbase.com
        </Text>
        <Text></Text>
        <Text color="cyan">Press 's' to skip browser testing, 'b' to go back</Text>
        <Text></Text>
        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />
      </Box>
    );
  }

  if (!isTesting && isConfigured) {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          🌐 Browser Testing Ready
        </Text>
        <Text></Text>
        <Text>
          Ready to test {deployedUrls.length} deployed application{deployedUrls.length > 1 ? 's' : ''}:
        </Text>
        <Text></Text>
        
        {deployedUrls.slice(0, 5).map((item, index) => (
          <Text key={index} dimColor>  • {item.url}</Text>
        ))}
        {deployedUrls.length > 5 && (
          <Text dimColor>  ... and {deployedUrls.length - 5} more URLs</Text>
        )}
        
        <Text></Text>
        <Text color="yellow">Testing configuration:</Text>
        <Text dimColor>• Max concurrent tabs: {BROWSER_TESTING_CONFIG.MAX_CONCURRENT_TABS}</Text>
        <Text dimColor>• Test duration per URL: {BROWSER_TESTING_CONFIG.TEST_DURATION_MS / 1000} seconds</Text>
        <Text dimColor>• Actions per URL: up to 5 automated interactions</Text>
        <Text></Text>
        <Text color="green">Press Enter to start browser testing</Text>
        <Text color="cyan">Press 's' to skip browser testing</Text>
        <Text></Text>
        <BackButton onBack={() => onBack?.()} isVisible={!!onBack} />
      </Box>
    );
  }

  // Testing in progress
  const progressPercentage = progress.totalUrls > 0 
    ? Math.round((progress.completedUrls / progress.totalUrls) * 100)
    : 0;

  const successCount = progress.results.filter(r => r.success).length;
  const failedCount = progress.results.filter(r => !r.success).length;

  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        🌐 Browser Testing In Progress
      </Text>
      <Text></Text>
      
      <Text>
        Progress: {progress.completedUrls}/{progress.totalUrls} ({progressPercentage}%)
      </Text>
      <Text color="green">✓ Successful: {successCount}</Text>
      <Text color="red">✗ Failed: {failedCount}</Text>
      <Text></Text>

      {progress.activeUrls.length > 0 && (
        <>
          <Text color="yellow" bold>
            Currently testing ({progress.activeUrls.length} active tab{progress.activeUrls.length > 1 ? 's' : ''}):
          </Text>
          {progress.activeUrls.map((url, index) => (
            <Text key={index} dimColor>  🔄 {url}</Text>
          ))}
          <Text></Text>
        </>
      )}

      {progress.results.length > 0 && (
        <>
          <Text color="cyan" bold>Recent results:</Text>
          {progress.results.slice(-3).map((result, index) => (
            <Box key={index} flexDirection="column">
              <Text color={result.success ? "green" : "red"}>
                {result.success ? "✓" : "✗"} {result.url} ({result.duration}ms)
              </Text>
              {result.actions.length > 0 && (
                <Text dimColor>    {result.actions.length} action{result.actions.length > 1 ? 's' : ''} performed</Text>
              )}
              {result.screenshots.length > 0 && (
                <Text dimColor>    {result.screenshots.length} screenshot{result.screenshots.length > 1 ? 's' : ''} captured</Text>
              )}
            </Box>
          ))}
          <Text></Text>
        </>
      )}

      <Text color="yellow">
        Browser testing will complete automatically...
      </Text>
      {canTerminate && (
        <Text dimColor>
          Press 'c' to terminate testing early
        </Text>
      )}
    </Box>
  );
};