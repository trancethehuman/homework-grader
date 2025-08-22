import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import { STAGEHAND_TEST_URL, BROWSER_SESSION_KEEP_ALIVE_MS } from "../../consts/stagehand-test.js";

export interface StagehandTestResult {
  testName: string;
  success: boolean;
  data?: any;
  error?: string;
  duration?: number;
}

export class StagehandService {
  private stagehand: Stagehand | null = null;

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

    this.stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey: this.apiKey,
      projectId: this.projectId,
      verbose: 1,
    });

    await this.stagehand.init();
  }

  async runNavigationTest(): Promise<StagehandTestResult> {
    const startTime = Date.now();
    
    try {
      if (!this.stagehand) {
        throw new Error("Stagehand not initialized");
      }

      const page = this.stagehand.page;
      await page.goto(STAGEHAND_TEST_URL);
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Scroll to see more content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      
      // Wait a moment to observe the scroll
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      
      const duration = Date.now() - startTime;
      
      return {
        testName: "Enhanced Navigation Test",
        success: true,
        data: { 
          url: STAGEHAND_TEST_URL,
          actions: ["loaded page", "scrolled to middle", "returned to top"]
        },
        duration
      };
    } catch (error) {
      return {
        testName: "Enhanced Navigation Test",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  async runActionTest(): Promise<StagehandTestResult> {
    const startTime = Date.now();
    
    try {
      if (!this.stagehand) {
        throw new Error("Stagehand not initialized");
      }

      const page = this.stagehand.page;
      await page.goto(STAGEHAND_TEST_URL);
      
      const actions = [];
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Try to click on a prominent button or link
      try {
        await page.act("click on the first visible button or call-to-action");
        actions.push("clicked on call-to-action button");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        actions.push("attempted to click button (may not exist)");
      }
      
      // Try to scroll and interact with the page
      try {
        await page.act("scroll down to see more content");
        actions.push("scrolled to view more content");
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        actions.push("attempted to scroll");
      }
      
      // Try to interact with any navigation elements
      try {
        await page.act("hover over any navigation menu or links");
        actions.push("interacted with navigation elements");
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        actions.push("attempted to interact with navigation");
      }
      
      const duration = Date.now() - startTime;
      
      return {
        testName: "Enhanced Action Test",
        success: true,
        data: { 
          actions: actions,
          totalActions: actions.length
        },
        duration
      };
    } catch (error) {
      return {
        testName: "Enhanced Action Test",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      };
    }
  }

  async runAllTests(): Promise<StagehandTestResult[]> {
    const results: StagehandTestResult[] = [];
    
    results.push(await this.runNavigationTest());
    results.push(await this.runActionTest());
    
    return results;
  }

  async keepAlive(duration: number = BROWSER_SESSION_KEEP_ALIVE_MS): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, duration);
    });
  }

  async cleanup(): Promise<void> {
    if (this.stagehand) {
      try {
        // Stagehand cleanup if available
        await this.stagehand.close?.();
      } catch (error) {
        console.warn("Warning during Stagehand cleanup:", error);
      }
      this.stagehand = null;
    }
  }

  isConfigured(): boolean {
    return !!(this.apiKey && this.projectId);
  }
}