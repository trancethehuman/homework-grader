import React, { useState, useEffect } from "react";
import { Text, Box, useInput } from "ink";
import { StagehandService, StagehandTestResult } from "../lib/stagehand/stagehand-service.js";
import { BROWSER_SESSION_KEEP_ALIVE_MS, COUNTDOWN_UPDATE_INTERVAL_MS } from "../consts/stagehand-test.js";

interface StagehandTestProps {
  onBack: () => void;
}

type TestState = "menu" | "running" | "results" | "keeping-alive";

export const StagehandTest: React.FC<StagehandTestProps> = ({ onBack }) => {
  const [state, setState] = useState<TestState>("menu");
  const [selectedTest, setSelectedTest] = useState<number>(0);
  const [results, setResults] = useState<StagehandTestResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [stagehandService, setStagehandService] = useState<StagehandService | null>(null);

  const testOptions = [
    { name: "Enhanced Navigation Test", description: "Navigate and scroll through multiple sections" },
    { name: "Enhanced Action Test", description: "Perform multiple page interactions" },
    { name: "All Tests", description: "Run comprehensive navigation and action tests" },
  ];

  useEffect(() => {
    // Check if Stagehand is configured
    const service = new StagehandService();
    setIsConfigured(service.isConfigured());
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      return; // Let parent handle exit
    }

    if (state === "menu") {
      if (key.upArrow && selectedTest > 0) {
        setSelectedTest(selectedTest - 1);
      } else if (key.downArrow && selectedTest < testOptions.length - 1) {
        setSelectedTest(selectedTest + 1);
      } else if (key.return) {
        if (!isConfigured) {
          setError("Browserbase not configured. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables.");
          return;
        }
        runTest(selectedTest);
      } else if (key.escape) {
        onBack();
      }
    } else if (state === "results") {
      if (key.escape) {
        setState("menu");
        setResults([]);
        setError(null);
      } else if (input === "q") {
        onBack();
      }
    } else if (state === "keeping-alive") {
      if (input === "c") {
        // Close browser session immediately
        if (stagehandService) {
          stagehandService.cleanup();
          setStagehandService(null);
        }
        setState("results");
      }
    }
  });

  const runTest = async (testIndex: number) => {
    setState("running");
    setError(null);
    setResults([]);

    try {
      const service = new StagehandService();
      await service.initialize();
      setStagehandService(service);

      let testResults: StagehandTestResult[];

      if (testIndex === 2) {
        // Run all tests
        testResults = await service.runAllTests();
      } else {
        // Run specific test
        let result: StagehandTestResult;
        switch (testIndex) {
          case 0:
            result = await service.runNavigationTest();
            break;
          case 1:
            result = await service.runActionTest();
            break;
          default:
            throw new Error("Invalid test index");
        }
        testResults = [result];
      }

      setResults(testResults);
      
      // Start keeping browser alive with countdown
      setState("keeping-alive");
      setCountdown(Math.ceil(BROWSER_SESSION_KEEP_ALIVE_MS / 1000));
      
      // Start countdown timer
      const countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            // Auto-cleanup after countdown
            service.cleanup().finally(() => {
              setStagehandService(null);
              setState("results");
            });
            return 0;
          }
          return prev - 1;
        });
      }, COUNTDOWN_UPDATE_INTERVAL_MS);

    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setState("menu");
      if (stagehandService) {
        stagehandService.cleanup();
        setStagehandService(null);
      }
    }
  };

  if (!isConfigured) {
    return (
      <Box flexDirection="column">
        <Text color="red" bold>
          Stagehand/Browserbase Test - Configuration Required
        </Text>
        <Text></Text>
        <Text color="yellow">
            Browserbase API credentials not found
        </Text>
        <Text></Text>
        <Text>To use Stagehand testing, please set the following environment variables:</Text>
        <Text dimColor>• BROWSERBASE_API_KEY</Text>
        <Text dimColor>• BROWSERBASE_PROJECT_ID</Text>
        <Text></Text>
        <Text dimColor>Get your credentials at: https://browserbase.com</Text>
      </Box>
    );
  }

  if (state === "running") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Running Stagehand Test...
        </Text>
        <Text></Text>
        <Text> Initializing Stagehand with Browserbase</Text>
        <Text>⏳ Running test: {testOptions[selectedTest].name}</Text>
        <Text></Text>
        <Text dimColor>This may take a few moments...</Text>
      </Box>
    );
  }

  if (state === "keeping-alive") {
    return (
      <Box flexDirection="column">
        <Text color="green" bold>
          ✓ Test Complete - Browser Session Active
        </Text>
        <Text></Text>
        
        {results.map((result, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text color={result.success ? "green" : "red"}>
              {result.success ? "✓" : "✗"} {result.testName}
              {result.duration && ` (${result.duration}ms)`}
            </Text>
            
            {result.success && result.data && (
              <Box marginLeft={2}>
                <Text dimColor>
                  Data: {JSON.stringify(result.data, null, 2)}
                </Text>
              </Box>
            )}
            
            {!result.success && result.error && (
              <Box marginLeft={2}>
                <Text color="red" dimColor>
                  Error: {result.error}
                </Text>
              </Box>
            )}
          </Box>
        ))}
        
        <Text></Text>
        <Text color="yellow" bold>
          🌐 Browser session open for viewing agent actions...
        </Text>
        <Text color="cyan">
            Auto-closing in {countdown} seconds
        </Text>
        <Text></Text>
        <Text color="blue">Press 'c' to close browser session now</Text>
      </Box>
    );
  }

  if (state === "results") {
    return (
      <Box flexDirection="column">
        <Text color="blue" bold>
          Stagehand Test Results
        </Text>
        <Text></Text>
        
        {results.map((result, index) => (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Text color={result.success ? "green" : "red"}>
              {result.success ? "✓" : "✗"} {result.testName}
              {result.duration && ` (${result.duration}ms)`}
            </Text>
            
            {result.success && result.data && (
              <Box marginLeft={2}>
                <Text dimColor>
                  Data: {JSON.stringify(result.data, null, 2)}
                </Text>
              </Box>
            )}
            
            {!result.success && result.error && (
              <Box marginLeft={2}>
                <Text color="red" dimColor>
                  Error: {result.error}
                </Text>
              </Box>
            )}
          </Box>
        ))}
        
        <Text></Text>
        <Text color="blue">Press Escape to run another test, 'q' to return to main flow</Text>
      </Box>
    );
  }

  // Menu state
  return (
    <Box flexDirection="column">
      <Text color="blue" bold>
        Stagehand/Browserbase Test Suite
      </Text>
      <Text></Text>
      <Text>Select a test to run:</Text>
      <Text></Text>

      {testOptions.map((option, index) => (
        <Box key={index} marginLeft={2}>
          <Text color={index === selectedTest ? "cyan" : "white"}>
            {index === selectedTest ? "▶ " : "  "}
            {option.name}
          </Text>
          <Text dimColor> - {option.description}</Text>
        </Box>
      ))}

      <Text></Text>
      <Text color="green">✓ Browserbase configured</Text>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
};