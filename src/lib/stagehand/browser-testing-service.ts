import { Stagehand } from "@browserbasehq/stagehand";
import { BROWSER_TESTING_CONFIG } from "../../consts/deployed-url-patterns.js";
import { AIProvider, ComputerUseModel } from "../../consts/ai-providers.js";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export interface BrowserTestResult {
  url: string;
  success: boolean;
  duration: number;
  screenshots: string[];
  actions: string[];
  errors: string[];
  pageId?: string;
  metadata: {
    title?: string;
    description?: string;
    finalUrl?: string;
    responseTime?: number;
    screenshotFolder?: string;
  };
}

export interface BrowserTestingProgress {
  totalUrls: number;
  completedUrls: number;
  activeUrls: string[];
  results: BrowserTestResult[];
}

export class BrowserTestingService {
  private sessionFolder: string = '';
  private sessionTimestamp: string = '';

  constructor(
    private apiKey?: string,
    private projectId?: string,
    private aiProvider?: AIProvider,
    private computerUseModel?: ComputerUseModel
  ) {
    this.apiKey = apiKey || process.env.BROWSERBASE_API_KEY;
    this.projectId = projectId || process.env.BROWSERBASE_PROJECT_ID;
    
    // Initialize session folder
    this.sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionFolder = join('browserbase-test', `${this.sessionTimestamp}`);
  }

  private urlToSafeFolderName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
    } catch {
      return url.replace(/[^a-zA-Z0-9]/g, '_');
    }
  }

  private async saveScreenshotToTemp(
    screenshotBuffer: Buffer, 
    url: string, 
    screenshotType: string
  ): Promise<string> {
    const urlSafeName = this.urlToSafeFolderName(url);
    const urlFolder = join(this.sessionFolder, urlSafeName);
    
    // Ensure directory exists
    try {
      mkdirSync(urlFolder, { recursive: true });
    } catch (error) {
      console.warn(`Warning: Could not create screenshot directory ${urlFolder}:`, error);
      return '';
    }

    const fileName = `${screenshotType}.png`;
    const filePath = join(urlFolder, fileName);
    
    try {
      writeFileSync(filePath, screenshotBuffer);
      return filePath;
    } catch (error) {
      console.warn(`Warning: Could not save screenshot ${filePath}:`, error);
      return '';
    }
  }

  private getStagehandProvider(): string {
    // Prefer computerUseModel if provided
    if (this.computerUseModel) {
      return this.computerUseModel.provider;
    }
    
    if (!this.aiProvider) return "openai"; // Default to OpenAI for computer use
    
    switch (this.aiProvider.id) {
      case "gemini":
        return "google";
      case "openai":
        return "openai";
      case "claude":
        return "anthropic";
      default:
        return "openai"; // Default to OpenAI for computer use
    }
  }

  private getStagehandModel(): string {
    // Prefer computerUseModel if provided
    if (this.computerUseModel) {
      return this.computerUseModel.model;
    }
    
    if (!this.aiProvider) return "computer-use-preview"; // Default to OpenAI computer use model
    
    // For Stagehand Computer Use Agent, we need specific models regardless of provider preference
    switch (this.aiProvider.id) {
      case "gemini":
        return "gemini-2.5-flash";
      case "openai":
        return "computer-use-preview"; // Required for Computer Use Agent (different from regular gpt-4o usage)
      case "claude":
        return "claude-sonnet-4-20250514";
      default:
        return "computer-use-preview"; // Default to OpenAI computer use model
    }
  }

  async initialize(): Promise<void> {
    if (!this.apiKey || !this.projectId) {
      throw new Error(
        "Browserbase API key and project ID are required. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables."
      );
    }

    console.log("🌐 Validating Browserbase credentials...");
    console.log("✓ Browser testing service ready - each URL will get its own isolated session");
  }

  async testDeployedUrls(
    urls: Array<{ url: string; pageId?: string }>,
    onProgress?: (progress: BrowserTestingProgress) => void
  ): Promise<BrowserTestResult[]> {
    console.log(` Starting browser testing for ${urls.length} deployed URLs...`);
    console.log(`   Processing sequentially with isolated sessions for reliability`);
    console.log(`   Test duration per URL: ${BROWSER_TESTING_CONFIG.TEST_DURATION_MS / 1000}s`);

    const results: BrowserTestResult[] = [];

    // Process URLs sequentially with individual Stagehand instances
    for (let i = 0; i < urls.length; i++) {
      const urlItem = urls[i];
      const urlIndex = i + 1;

      console.log(`\n🌐 [${urlIndex}/${urls.length}] Creating isolated session for ${urlItem.url}${urlItem.pageId ? ` (Notion page: ${urlItem.pageId})` : ''}`);

      // Update progress with current URL
      if (onProgress) {
        onProgress({
          totalUrls: urls.length,
          completedUrls: results.length,
          activeUrls: [urlItem.url],
          results: [...results]
        });
      }

      try {
        const result = await this.testSingleUrlWithIsolatedSession(urlItem, urlIndex, urls.length);
        results.push(result);
      } catch (error) {
        console.error(`✗ [${urlIndex}/${urls.length}] Failed to test ${urlItem.url}:`, error);
        
        // Create error result
        results.push({
          url: urlItem.url,
          success: false,
          duration: 0,
          screenshots: [],
          actions: ["Failed to create isolated session"],
          errors: [error instanceof Error ? error.message : String(error)],
          pageId: urlItem.pageId,
          metadata: {
            screenshotFolder: join(this.sessionFolder, this.urlToSafeFolderName(urlItem.url))
          }
        });
      }

      // Update progress after completion
      if (onProgress) {
        onProgress({
          totalUrls: urls.length,
          completedUrls: results.length,
          activeUrls: [],
          results: [...results]
        });
      }

      // Brief pause between tests to be respectful to resources
      if (i < urls.length - 1) {
        console.log("    Brief pause before next test...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n✓ Browser testing complete! Tested ${results.length} URLs.`);
    console.log(`✓ Successful tests: ${results.filter(r => r.success).length}`);
    console.log(`✗ Failed tests: ${results.filter(r => !r.success).length}`);

    return results;
  }

  private async testSingleUrlWithIsolatedSession(
    urlItem: { url: string; pageId?: string },
    index: number,
    total: number
  ): Promise<BrowserTestResult> {
    const { url, pageId } = urlItem;
    let stagehand: Stagehand | null = null;
    
    try {
      // Create isolated Stagehand instance for this URL
      console.log(`     Creating isolated Stagehand session...`);
      
      const stagehandConfig: any = {
        env: "BROWSERBASE",
        apiKey: this.apiKey,
        projectId: this.projectId,
        verbose: 1,
        // Required viewport configuration for Computer Use agents
        viewport: { 
          width: BROWSER_TESTING_CONFIG.BROWSER_WIDTH, 
          height: BROWSER_TESTING_CONFIG.BROWSER_HEIGHT 
        },
      };

      stagehand = new Stagehand(stagehandConfig);
      await stagehand.init();
      
      console.log(`    ✓ Isolated session created for ${url}`);
      
      // Add stabilization delay
      console.log(`    ⏳ Waiting ${BROWSER_TESTING_CONFIG.SESSION_STABILIZATION_MS / 1000} seconds for session stabilization...`);
      await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.SESSION_STABILIZATION_MS));
      
      // Get the page from this isolated session
      const page = stagehand.page;
      
      // Run the existing test logic with the isolated session
      return await this.testSingleUrl(urlItem, page, index, total, stagehand);
      
    } catch (error) {
      console.error(`    ✗ Failed to create isolated session for ${url}:`, error);
      throw error;
    } finally {
      // Clean up the isolated Stagehand instance
      if (stagehand) {
        try {
          await stagehand.close?.();
          console.log(`    ✓ Cleaned up isolated session for ${url}`);
        } catch (cleanupError) {
          console.warn(`     Warning during session cleanup for ${url}:`, cleanupError);
        }
      }
    }
  }

  private async testSingleUrl(
    urlItem: { url: string; pageId?: string },
    page: any, // Page object from isolated session
    index: number,
    total: number,
    stagehand: Stagehand
  ): Promise<BrowserTestResult> {
    const { url, pageId } = urlItem;
    const startTime = Date.now();
    const screenshots: string[] = [];
    const actions: string[] = [];
    const errors: string[] = [];

    console.log(`  [${index}/${total}] Testing: ${url}${pageId ? ` (Notion page: ${pageId})` : ''}`);    
    console.log(`    Using dedicated browser tab for this URL`);

    // Validate URL format
    if (!this.isValidUrl(url)) {
      const errorMsg = `Invalid URL format: ${url}`;
      console.log(`  ✗ [${index}/${total}] ${errorMsg}`);
      return {
        url,
        success: false,
        duration: Date.now() - startTime,
        screenshots,
        actions: ["URL validation failed"],
        errors: [errorMsg],
        pageId,
        metadata: {}
      };
    }

    try {
      // Navigate to the URL using the provided page with retry logic
      const responseTimeStart = Date.now();
      actions.push("Navigating to deployed application");
      
      let navigationSuccess = false;
      let lastError: Error | null = null;
      const maxRetries = BROWSER_TESTING_CONFIG.MAX_RETRIES;
      
      for (let attempt = 1; attempt <= maxRetries && !navigationSuccess; attempt++) {
        try {
          console.log(`    Attempt ${attempt}/${maxRetries}: Loading ${url}`);
          
          await page.goto(url, { 
            waitUntil: 'domcontentloaded',
            timeout: BROWSER_TESTING_CONFIG.NAVIGATION_TIMEOUT_MS
          });
          
          navigationSuccess = true;
          console.log(`    ✓ Successfully loaded ${url} on attempt ${attempt}`);
        } catch (navError) {
          lastError = navError instanceof Error ? navError : new Error(String(navError));
          console.log(`      Attempt ${attempt} failed for ${url}: ${lastError.message}`);
          
          if (attempt < maxRetries) {
            console.log(`    Waiting ${BROWSER_TESTING_CONFIG.RETRY_DELAY_MS / 1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.RETRY_DELAY_MS));
          }
        }
      }
      
      if (!navigationSuccess) {
        throw new Error(`Failed to load ${url} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
      }
      
      const responseTime = Date.now() - responseTimeStart;

      actions.push(`Page loaded successfully (${responseTime}ms)`);

      // Ensure page is fully ready for Computer Use agent
      console.log(`    ⏳ Ensuring page readiness for Computer Use agent...`);
      try {
        // Wait for network to be idle (no ongoing requests)
        await page.waitForLoadState('networkidle');
        actions.push("Network idle state reached");
        
        // Additional delay for fonts and assets to fully load
        console.log(`    ⏳ Waiting ${BROWSER_TESTING_CONFIG.FONT_LOAD_DELAY_MS / 1000} seconds for fonts and assets...`);
        await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.FONT_LOAD_DELAY_MS));
        actions.push("Fonts and assets loading delay completed");
        
        console.log(`    ✓ Page readiness checks completed`);
      } catch (readinessError) {
        console.log(`     Page readiness checks failed, continuing anyway: ${readinessError}`);
        actions.push("Page readiness checks failed, continuing anyway");
      }

      // Get page metadata
      const title = await page.title();
      const finalUrl = page.url();

      // Wait for initial page load
      await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.ACTION_DELAY_MS));

      // Take initial screenshot
      try {
        const screenshot1 = await page.screenshot({ type: 'png' });
        const screenshotPath = await this.saveScreenshotToTemp(screenshot1, url, 'initial');
        if (screenshotPath) {
          screenshots.push(screenshotPath);
          actions.push("Captured initial screenshot");
          console.log(`    ✓ Saved initial screenshot: ${screenshotPath}`);
        } else {
          actions.push("Initial screenshot save failed");
          errors.push("Failed to save initial screenshot");
        }
      } catch (screenshotError) {
        console.log(`    Warning: Could not capture initial screenshot: ${screenshotError}`);
        actions.push("Initial screenshot failed");
        errors.push(`Initial screenshot failed: ${screenshotError}`);
      }

      // Run agent-based comprehensive testing
      try {
        const agentResult = await this.executeAgentTesting(page, actions, stagehand);
        
        // Take screenshot after agent testing
        try {
          const agentScreenshot = await page.screenshot({ type: 'png' });
          const screenshotPath = await this.saveScreenshotToTemp(agentScreenshot, url, 'after-agent');
          if (screenshotPath) {
            screenshots.push(screenshotPath);
            actions.push("Captured screenshot after agent testing");
            console.log(`    ✓ Saved agent screenshot: ${screenshotPath}`);
          } else {
            actions.push("Agent screenshot save failed");
          }
        } catch (screenshotError) {
          console.log(`    Warning: Could not capture screenshot after agent testing`);
          actions.push("Screenshot after agent testing failed");
        }

        if (!agentResult.success) {
          errors.push(agentResult.summary);
        }
      } catch (agentError) {
        const errorMsg = agentError instanceof Error ? agentError.message : String(agentError);
        errors.push(`Agent testing failed: ${errorMsg}`);
        actions.push(`Agent testing failed: ${errorMsg}`);
        console.log(`    Agent testing failed: ${errorMsg}`);
      }

      // Take final screenshot
      if (screenshots.length === 1) { // Only initial screenshot was taken
        try {
          const finalScreenshot = await page.screenshot({ type: 'png' });
          const screenshotPath = await this.saveScreenshotToTemp(finalScreenshot, url, 'final');
          if (screenshotPath) {
            screenshots.push(screenshotPath);
            actions.push("Captured final screenshot");
            console.log(`    ✓ Saved final screenshot: ${screenshotPath}`);
          } else {
            actions.push("Final screenshot save failed");
          }
        } catch (screenshotError) {
          console.log(`    Warning: Could not capture final screenshot: ${screenshotError}`);
          actions.push("Final screenshot failed");
        }
      }

      const duration = Date.now() - startTime;
      console.log(`  ✓ [${index}/${total}] Successfully tested ${url} (${duration}ms, ${actions.length} actions)${pageId ? ` → Notion page: ${pageId}` : ''}`);

      return {
        url,
        success: true,
        duration,
        screenshots,
        actions,
        errors,
        pageId,
        metadata: {
          title,
          finalUrl,
          responseTime,
          screenshotFolder: join(this.sessionFolder, this.urlToSafeFolderName(url))
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ [${index}/${total}] Failed to test ${url}: ${errorMessage}${pageId ? ` → Notion page: ${pageId}` : ''}`);
      
      // Still try to capture a screenshot if possible for debugging
      try {
        const errorScreenshot = await page.screenshot({ type: 'png' });
        const screenshotPath = await this.saveScreenshotToTemp(errorScreenshot, url, 'error');
        if (screenshotPath) {
          screenshots.push(screenshotPath);
          actions.push("Captured error screenshot");
          console.log(`    ✓ Saved error screenshot: ${screenshotPath}`);
        } else {
          actions.push("Error screenshot save failed");
        }
      } catch (screenshotError) {
        console.log(`    Could not capture error screenshot: ${screenshotError}`);
      }

      return {
        url,
        success: false,
        duration,
        screenshots,
        actions,
        errors: [...errors, errorMessage],
        pageId,
        metadata: {
          screenshotFolder: join(this.sessionFolder, this.urlToSafeFolderName(url))
        }
      };
    }
  }

  private async executeAgentTesting(page: any, actions: string[], stagehand: Stagehand): Promise<{ success: boolean; summary: string }> {
    try {
      // Create agent for comprehensive testing using selected AI provider
      const agent = stagehand.agent({
        provider: this.getStagehandProvider() as any,
        model: this.getStagehandModel(),
        instructions: `You are a web application tester. Your job is to thoroughly explore and test this deployed application. 
        
        Please:
        1. Explore the main functionality by clicking buttons, links, and interactive elements
        2. Test forms by filling them with sample data
        3. Navigate through different sections/pages if available
        4. Test search, filters, or other interactive features
        5. Scroll and explore content to understand the application's purpose
        6. Try to interact with media, galleries, or dynamic content
        
        Spend time thoroughly testing the application to evaluate its functionality.`,
        // AI SDK packages automatically handle API keys through environment variables
        // No need to pass apiKey explicitly - respects existing key management
      });

      actions.push("Created AI agent for comprehensive testing");
      
      // Execute comprehensive testing
      const result = await agent.execute({
        instruction: "Thoroughly test this web application by exploring its features, functionality, and user interface. Try different interactions and test various components.",
        maxSteps: BROWSER_TESTING_CONFIG.AGENT_MAX_STEPS
      });

      if (result.success) {
        actions.push("Agent successfully completed comprehensive testing");
        actions.push("Agent executed multiple testing steps");
        return { 
          success: true, 
          summary: "Agent completed comprehensive testing successfully" 
        };
      } else {
        actions.push("Agent testing completed with partial success");
        return { 
          success: false, 
          summary: "Agent completed testing but encountered some limitations" 
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      actions.push(`Agent testing failed: ${errorMsg}`);
      return { 
        success: false, 
        summary: `Agent testing failed: ${errorMsg}` 
      };
    }
  }

  async cleanup(): Promise<void> {
    // No cleanup needed - individual sessions are cleaned up in testSingleUrlWithIsolatedSession
    console.log("✓ Browser testing service cleaned up successfully");
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.projectId);
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}