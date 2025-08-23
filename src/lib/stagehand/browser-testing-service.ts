import { Stagehand } from "@browserbasehq/stagehand";
import { BROWSER_TESTING_CONFIG } from "../../consts/deployed-url-patterns.js";

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
  };
}

export interface BrowserTestingProgress {
  totalUrls: number;
  completedUrls: number;
  activeUrls: string[];
  results: BrowserTestResult[];
}

export class BrowserTestingService {
  private stagehand: Stagehand | null = null;
  private stagehands: Map<string, Stagehand> = new Map();
  private testPromises: Map<string, Promise<BrowserTestResult>> = new Map();

  constructor(
    private apiKey?: string,
    private projectId?: string
  ) {
    this.apiKey = apiKey || process.env.BROWSERBASE_API_KEY;
    this.projectId = projectId || process.env.BROWSERBASE_PROJECT_ID;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey || !this.projectId) {
      throw new Error(
        "Browserbase API key and project ID are required. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID environment variables."
      );
    }

    if (this.stagehand) {
      console.log("ℹ Browser testing service already initialized");
      return;
    }

    console.log("🌐 Initializing Browserbase for multi-tab testing...");

    try {
      this.stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: this.apiKey,
        projectId: this.projectId,
        verbose: 1,
      });

      await this.stagehand.init();
      console.log("✓ Browserbase initialized successfully");
    } catch (error: any) {
      console.error("✗ Failed to initialize Browserbase:", error);
      throw error;
    }
  }

  async testDeployedUrls(
    urls: Array<{ url: string; pageId?: string }>,
    onProgress?: (progress: BrowserTestingProgress) => void
  ): Promise<BrowserTestResult[]> {
    if (!this.stagehand) {
      throw new Error("Browser testing service not initialized. Call initialize() first.");
    }

    console.log(`🚀 Starting browser testing for ${urls.length} deployed URLs...`);
    console.log(`   Max concurrent tabs: ${BROWSER_TESTING_CONFIG.MAX_CONCURRENT_TABS}`);
    console.log(`   Test duration per URL: ${BROWSER_TESTING_CONFIG.TEST_DURATION_MS / 1000}s`);

    const results: BrowserTestResult[] = [];
    const batchSize = Math.min(urls.length, BROWSER_TESTING_CONFIG.MAX_CONCURRENT_TABS);

    // Process URLs in batches to respect tab limits
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(urls.length / batchSize);

      console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} URLs)`);

      // Start all tests in this batch concurrently
      const batchPromises = batch.map(async (urlItem, batchIndex) => {
        const globalIndex = i + batchIndex;
        
        // Update progress
        if (onProgress) {
          onProgress({
            totalUrls: urls.length,
            completedUrls: results.length,
            activeUrls: batch.map(item => item.url),
            results: [...results]
          });
        }

        return this.testSingleUrl(urlItem, globalIndex + 1, urls.length);
      });

      // Wait for all tests in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update progress after batch completion
      if (onProgress) {
        onProgress({
          totalUrls: urls.length,
          completedUrls: results.length,
          activeUrls: [],
          results: [...results]
        });
      }

      console.log(`✓ Completed batch ${batchNumber}/${totalBatches}`);

      // Brief pause between batches to be respectful to resources
      if (i + batchSize < urls.length) {
        console.log("  Brief pause before next batch...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n✓ Browser testing complete! Tested ${results.length} URLs.`);
    console.log(`✓ Successful tests: ${results.filter(r => r.success).length}`);
    console.log(`✗ Failed tests: ${results.filter(r => !r.success).length}`);

    return results;
  }

  private async testSingleUrl(
    urlItem: { url: string; pageId?: string },
    index: number,
    total: number
  ): Promise<BrowserTestResult> {
    const { url, pageId } = urlItem;
    const startTime = Date.now();
    const screenshots: string[] = [];
    const actions: string[] = [];
    const errors: string[] = [];

    console.log(`  [${index}/${total}] Testing: ${url}`);

    // Create a new Stagehand instance for this URL (multi-tab)
    let stagehand: Stagehand | null = null;

    try {
      // Create new Stagehand instance for this tab
      stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: this.apiKey!,
        projectId: this.projectId!,
        verbose: 1,
      });

      await stagehand.init();
      this.stagehands.set(url, stagehand);

      // Navigate to the URL
      const responseTimeStart = Date.now();
      actions.push("Navigating to deployed application");
      await stagehand.page.goto(url);
      const responseTime = Date.now() - responseTimeStart;

      actions.push(`Page loaded successfully (${responseTime}ms)`);

      // Get page metadata
      const title = await stagehand.page.title();
      const finalUrl = stagehand.page.url();

      // Wait for initial page load
      await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.ACTION_DELAY_MS));

      // Take initial screenshot using Stagehand
      const screenshot1 = await stagehand.page.screenshot({ type: 'png' });
      screenshots.push(screenshot1.toString('base64'));
      actions.push("Captured initial screenshot");

      // Run automated tests for the remaining duration
      const testDuration = BROWSER_TESTING_CONFIG.TEST_DURATION_MS;
      const testEndTime = Date.now() + testDuration;

      let actionCount = 0;
      while (Date.now() < testEndTime && actionCount < 5) { // Max 5 actions per test
        const remainingTime = testEndTime - Date.now();
        if (remainingTime < BROWSER_TESTING_CONFIG.ACTION_DELAY_MS) break;

        try {
          // Perform different actions using Stagehand
          await this.performRandomAction(stagehand, actions, actionCount);
          actionCount++;

          // Take screenshot after action if enough time remains
          if (remainingTime > BROWSER_TESTING_CONFIG.SCREENSHOT_INTERVAL_MS) {
            await new Promise(resolve => setTimeout(resolve, BROWSER_TESTING_CONFIG.ACTION_DELAY_MS));
            const screenshot = await stagehand.page.screenshot({ type: 'png' });
            screenshots.push(screenshot.toString('base64'));
            actions.push(`Captured screenshot after action ${actionCount}`);
          }
        } catch (actionError) {
          const errorMsg = actionError instanceof Error ? actionError.message : String(actionError);
          errors.push(`Action ${actionCount + 1} failed: ${errorMsg}`);
          actions.push(`Action ${actionCount + 1} failed: ${errorMsg}`);
        }
      }

      // Take final screenshot
      if (screenshots.length === 1) { // Only initial screenshot was taken
        const finalScreenshot = await stagehand.page.screenshot({ type: 'png' });
        screenshots.push(finalScreenshot.toString('base64'));
        actions.push("Captured final screenshot");
      }

      // Cleanup this Stagehand instance
      await stagehand.close();
      this.stagehands.delete(url);

      const duration = Date.now() - startTime;
      console.log(`  ✓ [${index}/${total}] Successfully tested ${url} (${duration}ms, ${actions.length} actions)`);

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
          responseTime
        }
      };

    } catch (error) {
      // Clean up Stagehand instance if it exists
      if (stagehand) {
        try {
          await stagehand.close();
        } catch (closeError) {
          // Ignore close errors
        }
        this.stagehands.delete(url);
      }

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ✗ [${index}/${total}] Failed to test ${url}: ${errorMessage}`);

      return {
        url,
        success: false,
        duration,
        screenshots,
        actions,
        errors: [...errors, errorMessage],
        pageId,
        metadata: {}
      };
    }
  }

  private async performRandomAction(stagehand: Stagehand, actions: string[], actionIndex: number): Promise<void> {
    const possibleActions = [
      // Interaction actions using Stagehand
      async () => {
        await stagehand.page.act("click on the most prominent button or call-to-action");
        actions.push("Clicked on prominent button/CTA");
      },
      async () => {
        await stagehand.page.act("scroll down to see more content");
        actions.push("Scrolled down to view more content");
      },
      async () => {
        await stagehand.page.act("hover over navigation menu items");
        actions.push("Hovered over navigation elements");
      },
      async () => {
        await stagehand.page.act("click on any navigation links or menu items");
        actions.push("Clicked on navigation link");
      },
      async () => {
        await stagehand.page.act("look for and interact with any forms on the page");
        actions.push("Attempted to interact with forms");
      },
      // Observation actions using page.evaluate through Stagehand
      async () => {
        await stagehand.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 3);
        });
        actions.push("Scrolled to middle of page");
      },
      async () => {
        await stagehand.page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        actions.push("Scrolled back to top");
      }
    ];

    // Choose action based on index to ensure variety
    const actionToPerform = possibleActions[actionIndex % possibleActions.length];
    await actionToPerform();
  }

  async cleanup(): Promise<void> {
    // Close any remaining Stagehand instances
    for (const [url, stagehandInstance] of this.stagehands.entries()) {
      try {
        await stagehandInstance.close();
        console.log(`  Closed Stagehand instance for ${url}`);
      } catch (error) {
        console.warn(`Warning: Failed to close Stagehand instance for ${url}:`, error);
      }
    }
    this.stagehands.clear();

    // Close main Stagehand if it exists
    if (this.stagehand) {
      try {
        await this.stagehand.close?.();
        console.log("✓ Browser testing service cleaned up successfully");
      } catch (error) {
        console.warn("Warning during browser testing cleanup:", error);
      }
      this.stagehand = null;
    }
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.projectId);
  }
}