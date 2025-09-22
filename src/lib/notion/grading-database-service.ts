import { NotionService } from "./notion-service.js";
import { NotionOAuthClient } from "./oauth-client.js";
import { NotionSchemaMapper } from "./schema-mapper.js";
import { GradingResult } from "../file-saver.js";
import { ConflictDetector, ConflictDetectionResult, OverrideDecision } from "./conflict-detector.js";

export interface DatabaseCreationOptions {
  title?: string;
  parentPageId?: string;
}

export class GradingDatabaseService {
  private notionService: NotionService;
  private conflictDetector: ConflictDetector;

  constructor(accessToken?: string) {
    this.notionService = new NotionService(accessToken);
    this.conflictDetector = new ConflictDetector(accessToken);
  }

  /**
   * Ensure grading database exists with proper schema
   * Creates new database or updates existing one with missing columns
   */
  async ensureGradingDatabase(
    sourceDatabaseId?: string,
    options: DatabaseCreationOptions & { skipGithubUrlColumn?: string; processingMode?: 'code' | 'browser' | 'both' } = {}
  ): Promise<{ databaseId: string; created: boolean; updated: boolean }> {
    if (sourceDatabaseId) {
      // Check existing database and update schema if needed
      return await this.updateExistingDatabase(sourceDatabaseId, options);
    } else {
      // Create new database
      return await this.createNewGradingDatabase(options);
    }
  }

  /**
   * Check for conflicts before saving grading results
   */
  async checkForConflicts(
    databaseId: string,
    results: GradingResult[],
    githubUrlColumnName?: string,
    browserTestResults?: any[],
    processingMode: 'code' | 'browser' | 'both' = 'both'
  ): Promise<ConflictDetectionResult[]> {
    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(
      databaseId
    );
    const titlePropertyName = Object.keys(databaseProperties).find(
      (key) => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    // Prepare updates for conflict checking
    const updatesForConflictCheck: Array<{
      pageId: string;
      properties: Record<string, any>;
      repositoryName: string;
    }> = [];

    for (const result of results) {
      if (result.pageId) { // Only check conflicts for updates, not new entries
        // Find matching browser test result for this repository
        const matchingBrowserTest = browserTestResults?.find(browserTest =>
          browserTest.pageId === result.pageId ||
          browserTest.url?.includes(result.repositoryName.replace('/', '-'))
        );

        const allProperties =
          NotionSchemaMapper.transformGradingDataToNotionProperties(
            result.gradingData,
            result.repositoryName,
            result.githubUrl,
            titlePropertyName,
            githubUrlColumnName,
            true, // isUpdate
            matchingBrowserTest,
            result.error,
            processingMode
          );

        // Only include properties that actually exist in the database
        const filteredProperties: Record<string, any> = {};
        for (const [key, value] of Object.entries(allProperties)) {
          if (availableProperties.has(key)) {
            filteredProperties[key] = value;
          }
        }

        updatesForConflictCheck.push({
          pageId: result.pageId,
          properties: filteredProperties,
          repositoryName: result.repositoryName
        });
      }
    }

    return await this.conflictDetector.checkBatchConflicts(updatesForConflictCheck);
  }

  /**
   * Save grading results to database with conflict resolution
   */
  async saveGradingResultsWithConflictResolution(
    databaseId: string,
    results: GradingResult[],
    overrideDecisions: Map<string, OverrideDecision[]>,
    githubUrlColumnName?: string,
    browserTestResults?: any[],
    processingMode: 'code' | 'browser' | 'both' = 'both'
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(
      databaseId
    );
    const titlePropertyName = Object.keys(databaseProperties).find(
      (key) => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    for (const result of results) {
      try {
        const isUpdate = !!result.pageId;

        // Find matching browser test result for this repository
        const matchingBrowserTest = browserTestResults?.find(browserTest =>
          browserTest.pageId === result.pageId ||
          browserTest.url?.includes(result.repositoryName.replace('/', '-'))
        );

        const allProperties =
          NotionSchemaMapper.transformGradingDataToNotionProperties(
            result.gradingData,
            result.repositoryName,
            result.githubUrl,
            titlePropertyName,
            githubUrlColumnName,
            isUpdate,
            matchingBrowserTest,
            result.error,
            processingMode
          );

        // Only include properties that actually exist in the database
        let filteredProperties: Record<string, any> = {};
        for (const [key, value] of Object.entries(allProperties)) {
          if (availableProperties.has(key)) {
            filteredProperties[key] = value;
          }
        }

        // Apply override decisions if this is an update with conflicts
        if (isUpdate && result.pageId && overrideDecisions.has(result.pageId)) {
          const decisions = overrideDecisions.get(result.pageId)!;
          filteredProperties = this.conflictDetector.applyOverrideDecisions(
            filteredProperties,
            decisions
          );
        }

        if (isUpdate && result.pageId) {
          // Update existing row
          await this.notionService.updateDatabaseEntry(
            result.pageId,
            filteredProperties
          );
        } else {
          // Create new row
          await this.notionService.createDatabaseEntry(
            databaseId,
            filteredProperties
          );
        }
        success++;
      } catch (error: any) {
        failed++;
        errors.push(
          `Failed to save ${result.repositoryName}: ${error.message}`
        );
      }
    }

    return { success, failed, errors };
  }

  /**
   * Save grading results to database (legacy method - no conflict checking)
   */
  async saveGradingResults(
    databaseId: string,
    results: GradingResult[],
    githubUrlColumnName?: string,
    browserTestResults?: any[],
    processingMode: 'code' | 'browser' | 'both' = 'both'
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(
      databaseId
    );
    const titlePropertyName = Object.keys(databaseProperties).find(
      (key) => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    for (const result of results) {
      try {
        const isUpdate = !!result.pageId;
        
        // Find matching browser test result for this repository
        const matchingBrowserTest = browserTestResults?.find(browserTest => 
          browserTest.pageId === result.pageId || 
          browserTest.url?.includes(result.repositoryName.replace('/', '-'))
        );
        
        const allProperties =
          NotionSchemaMapper.transformGradingDataToNotionProperties(
            result.gradingData,
            result.repositoryName,
            result.githubUrl,
            titlePropertyName,
            githubUrlColumnName,
            isUpdate,
            matchingBrowserTest,
            result.error,
            processingMode
          );

        // Only include properties that actually exist in the database
        const filteredProperties: Record<string, any> = {};
        for (const [key, value] of Object.entries(allProperties)) {
          if (availableProperties.has(key)) {
            filteredProperties[key] = value;
          }
        }

        if (isUpdate && result.pageId) {
          // Update existing row
          await this.notionService.updateDatabaseEntry(
            result.pageId,
            filteredProperties
          );
        } else {
          // Create new row
          await this.notionService.createDatabaseEntry(
            databaseId,
            filteredProperties
          );
        }
        success++;
      } catch (error: any) {
        failed++;
        errors.push(
          `Failed to save ${result.repositoryName}: ${error.message}`
        );
      }
    }

    return { success, failed, errors };
  }

  /**
   * Save single grading result to database
   */
  async saveGradingResult(
    databaseId: string,
    result: GradingResult,
    githubUrlColumnName?: string,
    browserTestResult?: any
  ): Promise<any> {
    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(
      databaseId
    );
    const titlePropertyName = Object.keys(databaseProperties).find(
      (key) => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    const isUpdate = !!result.pageId;
    const allProperties =
      NotionSchemaMapper.transformGradingDataToNotionProperties(
        result.gradingData,
        result.repositoryName,
        result.githubUrl,
        titlePropertyName,
        githubUrlColumnName,
        isUpdate,
        browserTestResult,
        result.error
      );

    // Only include properties that actually exist in the database
    const filteredProperties: Record<string, any> = {};
    for (const [key, value] of Object.entries(allProperties)) {
      if (availableProperties.has(key)) {
        filteredProperties[key] = value;
      }
    }

    if (isUpdate && result.pageId) {
      return await this.notionService.updateDatabaseEntry(
        result.pageId,
        filteredProperties
      );
    } else {
      return await this.notionService.createDatabaseEntry(
        databaseId,
        filteredProperties
      );
    }
  }

  /**
   * Get database info and check if it has grading schema
   */
  async getDatabaseInfo(databaseId: string): Promise<{
    title: string;
    hasGradingSchema: boolean;
    missingProperties: string[];
  }> {
    try {
      const database = await this.notionService.getDatabaseMetadata(databaseId);
      const hasGradingSchema = NotionSchemaMapper.hasGradingProperties(
        database.properties
      );

      let missingProperties: string[] = [];
      if (!hasGradingSchema) {
        const missing = NotionSchemaMapper.getMissingGradingProperties(
          database.properties
        );
        missingProperties = Object.keys(missing);
      }

      const title =
        database.title && database.title.length > 0
          ? database.title[0].plain_text
          : "Untitled Database";

      return {
        title,
        hasGradingSchema,
        missingProperties,
      };
    } catch (error: any) {
      throw new Error(`Failed to get database info: ${error.message}`);
    }
  }

  private async updateExistingDatabase(
    databaseId: string,
    options: { skipGithubUrlColumn?: string; processingMode?: 'code' | 'browser' | 'both' } = {}
  ): Promise<{ databaseId: string; created: boolean; updated: boolean }> {
    try {
      const existingProperties = await this.notionService.getDatabaseProperties(
        databaseId
      );
      const missingProperties = NotionSchemaMapper.getMissingGradingProperties(
        existingProperties,
        {
          skipGithubUrlColumn: !!options.skipGithubUrlColumn,
          processingMode: options.processingMode || 'both'
        }
      );

      if (Object.keys(missingProperties).length > 0) {
        // Update database with missing properties
        await this.notionService.updateDatabaseSchema(
          databaseId,
          missingProperties
        );
        return { databaseId, created: false, updated: true };
      }

      // Database already has all required properties
      return { databaseId, created: false, updated: false };
    } catch (error: any) {
      throw new Error(`Failed to update database schema: ${error.message}`);
    }
  }

  private async createNewGradingDatabase(
    options: DatabaseCreationOptions & { processingMode?: 'code' | 'browser' | 'both' }
  ): Promise<{ databaseId: string; created: boolean; updated: boolean }> {
    const title =
      options.title ||
      `Homework Grading Results - ${new Date().toISOString().split("T")[0]}`;
    const properties = NotionSchemaMapper.generateGradingDatabaseProperties(true, {
      processingMode: options.processingMode || 'both'
    });

    try {
      // If no parent page ID provided, we need to get one from the user or use a default approach
      if (!options.parentPageId) {
        throw new Error(
          "Creating a new database requires a parent page ID. Please select a page from your Notion workspace to create the database under."
        );
      }

      const database = await this.notionService.createDatabase(
        title,
        properties,
        options.parentPageId
      );

      return { databaseId: database.id, created: true, updated: false };
    } catch (error: any) {
      throw new Error(`Failed to create grading database: ${error.message}`);
    }
  }

  /**
   * List all databases accessible to integration
   */
  async getAllDatabases() {
    return await this.notionService.getAllDatabases();
  }
}
