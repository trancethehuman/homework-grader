export interface InkEnvironmentInfo {
  isRawModeSupported: boolean;
  stdinIsTTY: boolean;
  hasStdin: boolean;
  reason?: string;
}

/**
 * Check if the current environment supports Ink's interactive features
 */
export function checkInkEnvironment(): InkEnvironmentInfo {
  const hasStdin = !!process.stdin;
  const stdinIsTTY = process.stdin?.isTTY === true;

  if (!hasStdin) {
    return {
      isRawModeSupported: false,
      stdinIsTTY: false,
      hasStdin: false,
      reason: 'No stdin available'
    };
  }

  if (!stdinIsTTY) {
    return {
      isRawModeSupported: false,
      stdinIsTTY: false,
      hasStdin: true,
      reason: 'stdin is not a TTY (running in non-interactive environment)'
    };
  }

  try {
    // Test if raw mode is supported by attempting to set it
    if (process.stdin.setRawMode) {
      // Save current mode
      const wasRaw = process.stdin.isRaw;

      try {
        // Try to set raw mode briefly to test support
        process.stdin.setRawMode(true);

        // Add a small delay and try to interact with stdin to verify it actually works
        setTimeout(() => {
          try {
            if (process.stdin.setRawMode) {
              process.stdin.setRawMode(wasRaw || false);
            }
          } catch (restoreError) {
            // Ignore restore errors as the main test already passed
          }
        }, 10);

        // Additional test: check if we can actually read from stdin in raw mode
        const testListener = () => {}; // Empty listener for testing
        process.stdin.on('data', testListener);
        process.stdin.removeListener('data', testListener);

        return {
          isRawModeSupported: true,
          stdinIsTTY: true,
          hasStdin: true
        };
      } catch (rawModeError) {
        // Raw mode setting failed
        return {
          isRawModeSupported: false,
          stdinIsTTY: true,
          hasStdin: true,
          reason: `Raw mode test failed: ${rawModeError instanceof Error ? rawModeError.message : String(rawModeError)}`
        };
      }
    } else {
      return {
        isRawModeSupported: false,
        stdinIsTTY: true,
        hasStdin: true,
        reason: 'setRawMode is not available on stdin'
      };
    }
  } catch (error) {
    return {
      isRawModeSupported: false,
      stdinIsTTY: true,
      hasStdin: true,
      reason: `Error testing raw mode support: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Enhanced render function with environment checks and error handling
 */
export async function safeRender<T>(element: React.ReactElement, options?: { exitOnCtrlC?: boolean }): Promise<{
  unmount: () => void;
  waitUntilExit: () => Promise<void>;
}> {
  const environmentInfo = checkInkEnvironment();

  if (!environmentInfo.isRawModeSupported) {
    console.error('\n Interactive mode is not supported in this environment:');
    console.error(`   ${environmentInfo.reason}`);
    console.error('\n Possible solutions:');
    console.error('   • Run in a proper terminal (not through an IDE or script)');
    console.error('   • Use a different terminal emulator');
    console.error('   • Run with proper TTY allocation if using Docker');
    console.error('   • Use command-line arguments instead of interactive mode');

    // Return a mock object that immediately exits
    return {
      unmount: () => {},
      waitUntilExit: async () => {
        process.exit(1);
      }
    };
  }

  // Environment supports raw mode, proceed with normal Ink render
  try {
    const { render } = await import('ink');

    // Wrap the render call to catch runtime Ink errors
    try {
      const app = render(element, options);

      // Add error handler for runtime Ink errors
      process.on('uncaughtException', (error) => {
        if (error.message.includes('Raw mode is not supported')) {
          console.error('\n Interactive mode failed at runtime:');
          console.error('   Raw mode is not supported in this environment');
          console.error('\n Possible solutions:');
          console.error('   • Run in a proper terminal (not through an IDE or script)');
          console.error('   • Use a different terminal emulator');
          console.error('   • Use command-line arguments instead of interactive mode');
          app.unmount();
          process.exit(1);
        } else {
          throw error; // Re-throw non-Ink errors
        }
      });

      return app;
    } catch (renderError) {
      // Runtime Ink render error
      console.error('\n Interactive mode failed during render:');
      console.error(`   ${renderError instanceof Error ? renderError.message : String(renderError)}`);
      console.error('\n Please try running in a different terminal or use command-line arguments instead.');

      return {
        unmount: () => {},
        waitUntilExit: async () => {
          process.exit(1);
        }
      };
    }
  } catch (error) {
    console.error('\n Failed to initialize interactive mode:');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    console.error('\n Please try running in a different terminal or use command-line arguments instead.');

    return {
      unmount: () => {},
      waitUntilExit: async () => {
        process.exit(1);
      }
    };
  }
}

/**
 * Check if we should use interactive mode based on environment
 */
export function shouldUseInteractiveMode(): boolean {
  const env = checkInkEnvironment();
  return env.isRawModeSupported;
}