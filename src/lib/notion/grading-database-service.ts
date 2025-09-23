import { NotionService } from "./notion-service.js";
import { NotionOAuthClient } from "./oauth-client.js";
import { NotionSchemaMapper } from "./schema-mapper.js";
import { GradingResult } from "../file-saver.js";
import { ConflictDetector, ConflictDetectionResult, OverrideDecision } from "./conflict-detector.js";
import { DebugLogger } from "../debug-logger.js";

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
    DebugLogger.debug(`🏗️ Ensuring grading database exists...`);
    DebugLogger.debug(`📊 Processing mode: ${options.processingMode || 'both'}`);

    try {
      if (sourceDatabaseId) {
        DebugLogger.debug(`🔧 Using existing database: ${sourceDatabaseId}`);
        // Check existing database and update schema if needed
        return await this.updateExistingDatabase(sourceDatabaseId, options);
      } else {
        DebugLogger.debug(`🆕 Creating new grading database`);
        // Create new database
        return await this.createNewGradingDatabase(options);
      }
    } catch (error: any) {
      console.log(`❌ Failed to ensure grading database: ${error.message}`);
      throw error; // Re-throw to preserve the original error
    }
  }

  /**
   * Check if grading fields exist in database schema (simplified approach)
   */
  async checkForExistingGradingFields(
    databaseId: string,
    processingMode: 'code' | 'browser' | 'both' = 'both'
  ): Promise<{ hasExistingFields: boolean; existingFields: string[] }> {
    // Get database properties to check what fields exist
    const databaseProperties = await this.notionService.getDatabaseProperties(databaseId);
    const availableProperties = new Set(Object.keys(databaseProperties));

    // Get grading field mappings based on processing mode
    const gradingFields = this.getGradingFieldMappings(processingMode);

    // Check which grading fields already exist
    const existingFields = Object.keys(gradingFields).filter(fieldName =>
      availableProperties.has(fieldName)
    );

    return {
      hasExistingFields: existingFields.length > 0,
      existingFields
    };
  }

  /**
   * Get mapping of grading field names based on processing mode
   */
  private getGradingFieldMappings(processingMode: 'code' | 'browser' | 'both' = 'both'): Record<string, string> {
    const baseFields = {
      'Processing Status': 'Processing Status',
      'Processing Error': 'Processing Error'
    };

    if (processingMode === 'code' || processingMode === 'both') {
      Object.assign(baseFields, {
        'Developer Feedback': 'Developer Feedback',
        'Repo Explained': 'Repository Explanation',
        'Grade': 'Grade'
      });
    }

    if (processingMode === 'browser' || processingMode === 'both') {
      Object.assign(baseFields, {
        'Browser Test Results': 'Browser Test Results',
        'Browser Test Status': 'Browser Test Status',
        'Browser Test Screenshots': 'Browser Test Screenshots',
        'Browser Test Actions': 'Browser Test Actions',
        'Browser Test Duration': 'Browser Test Duration',
        'Browser Test Errors': 'Browser Test Errors'
      });
    }

    return baseFields;
  }

  /**
   * Save grading results to database (simplified without complex conflict resolution)
   */
  async saveGradingResultsWithOverride(
    databaseId: string,
    results: GradingResult[],
    overrideExistingData: boolean,
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

        // Simple override logic: if overrideExistingData is false and this is an update, skip it
        if (isUpdate && result.pageId && !overrideExistingData) {
          // Skip updating existing entries if override is disabled
          continue;
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
    console.log(`💾 Saving ${results.length} grading results to Notion database...`);
    DebugLogger.debug(`🔧 Processing mode: ${processingMode}`);

    const overallStartTime = Date.now();
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    try {
      // Validate database has required columns before attempting saves
      await this.validateDatabaseForSaving(databaseId, processingMode);

      // Get the existing database properties (refresh after validation)
      const databaseProperties = await this.notionService.getDatabaseProperties(
        databaseId
      );
      const titlePropertyName = Object.keys(databaseProperties).find(
        (key) => databaseProperties[key].type === "title"
      );
      const availableProperties = new Set(Object.keys(databaseProperties));

      DebugLogger.debug(`📋 Available database properties: ${Array.from(availableProperties).join(', ')}`);

      // Use batched parallel processing for better performance
      const BATCH_SIZE = 3; // Respect Notion API rate limit of 3 requests/second
      const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches
      const totalBatches = Math.ceil(results.length / BATCH_SIZE);

      DebugLogger.debug(`🚀 Starting batched parallel processing: ${results.length} repositories in ${totalBatches} batches`);

      for (let i = 0; i < results.length; i += BATCH_SIZE) {
        const batch = results.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const startIndex = i;

        DebugLogger.debug(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} repositories)...`);

        // Show batch start info
        const batchRepoNames = batch.map(r => r.repositoryName).join(', ');
        DebugLogger.debug(`🚀 Starting batch ${batchNumber}: ${batchRepoNames}`);

        // Process batch in parallel using Promise.allSettled
        const batchStartTime = Date.now();
        const batchPromises = batch.map((result, batchIndex) =>
          this.processSingleResult(
            result,
            databaseId,
            titlePropertyName,
            githubUrlColumnName,
            availableProperties,
            browserTestResults,
            processingMode,
            startIndex + batchIndex + 1,
            results.length
          )
        );

        const batchResults = await Promise.allSettled(batchPromises);
        const batchDuration = Date.now() - batchStartTime;

        // Process batch results with detailed feedback
        let batchSuccess = 0;
        let batchFailed = 0;

        batchResults.forEach((batchResult, batchIndex) => {
          const result = batch[batchIndex];
          if (batchResult.status === 'fulfilled') {
            batchSuccess++;
            success++;
          } else {
            batchFailed++;
            failed++;
            const errorMessage = `Failed to save ${result.repositoryName}: ${batchResult.reason?.message || batchResult.reason}`;
            DebugLogger.debug(`❌ Error: ${errorMessage}`);
            errors.push(errorMessage);
          }
        });

        // Show batch completion summary
        const completedCount = Math.min(i + BATCH_SIZE, results.length);
        const progressPercent = Math.round((completedCount / results.length) * 100);
        const remainingCount = results.length - completedCount;
        const avgTimePerRepo = batchDuration / batch.length;
        const estimatedTimeRemaining = remainingCount > 0 ? Math.round((remainingCount * avgTimePerRepo) / 1000) : 0;

        DebugLogger.debug(`✅ Batch ${batchNumber} completed in ${batchDuration}ms (${batchSuccess} success, ${batchFailed} failed)`);
        DebugLogger.debug(`📊 Overall Progress: ${completedCount}/${results.length} (${progressPercent}%) | Success: ${success} | Failed: ${failed}`);

        if (remainingCount > 0) {
          DebugLogger.debug(`⏱️ Estimated time remaining: ~${estimatedTimeRemaining}s (${Math.ceil(remainingCount / BATCH_SIZE)} batches left)`);
        }

        // Wait before next batch (if more remain)
        if (i + BATCH_SIZE < results.length) {
          DebugLogger.debug(`⏳ Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
    } catch (error: any) {
      DebugLogger.debug(`❌ Database validation failed: ${error.message}`);
      return {
        success: 0,
        failed: results.length,
        errors: [`Database validation failed: ${error.message}`]
      };
    }

    // Final performance summary
    const totalDuration = Date.now() - overallStartTime;
    const totalDurationSeconds = Math.round(totalDuration / 1000);
    const avgTimePerRepo = success > 0 ? Math.round(totalDuration / success) : 0;

    console.log(`✅ Saved ${success} results to Notion database${failed > 0 ? ` (${failed} failed)` : ''}`);

    DebugLogger.debug(`\n🏁 Batch processing completed in ${totalDurationSeconds}s!`);
    DebugLogger.debug(`📊 Final Results: ${success} succeeded, ${failed} failed out of ${results.length} repositories`);

    if (success > 0) {
      DebugLogger.debug(`⚡ Performance: Processed ${success} repositories in ${totalDurationSeconds}s (${avgTimePerRepo}ms/repo avg)`);
      DebugLogger.debug(`📈 Efficiency: ~3 repositories processed concurrently per batch with 1000ms delays`);
    }

    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} repositories failed to save`);
    }

    return { success, failed, errors };
  }

  /**
   * Validate that database has all required columns for saving
   */
  private async validateDatabaseForSaving(
    databaseId: string,
    processingMode: 'code' | 'browser' | 'both'
  ): Promise<void> {
    DebugLogger.debug(`🔍 Validating database ${databaseId} for processing mode: ${processingMode}`);

    const databaseProperties = await this.notionService.getDatabaseProperties(databaseId);
    const missingProperties = NotionSchemaMapper.getMissingGradingProperties(
      databaseProperties,
      { skipGithubUrlColumn: false, processingMode }
    );

    if (Object.keys(missingProperties).length > 0) {
      DebugLogger.debug(`❌ Database is missing required columns: ${Object.keys(missingProperties).join(', ')}`);
      throw new Error(`Database is missing required grading columns: ${Object.keys(missingProperties).join(', ')}. Please run the schema update step first.`);
    }

    DebugLogger.debug(`✅ Database validation passed - all required columns present`);
  }

  /**
   * Process a single grading result for batched parallel processing
   */
  private async processSingleResult(
    result: GradingResult,
    databaseId: string,
    titlePropertyName?: string,
    githubUrlColumnName?: string,
    availableProperties?: Set<string>,
    browserTestResults?: any[],
    processingMode: 'code' | 'browser' | 'both' = 'both',
    index?: number,
    total?: number
  ): Promise<void> {
    const isUpdate = !!result.pageId;

    // Find matching browser test result for this repository
    const matchingBrowserTest = browserTestResults?.find(browserTest =>
      browserTest.pageId === result.pageId ||
      browserTest.url?.includes(result.repositoryName.replace('/', '-'))
    );

    const allProperties = NotionSchemaMapper.transformGradingDataToNotionProperties(
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
    if (availableProperties) {
      for (const [key, value] of Object.entries(allProperties)) {
        if (availableProperties.has(key)) {
          filteredProperties[key] = value;
        }
      }
    } else {
      Object.assign(filteredProperties, allProperties);
    }

    const progressText = index && total ? ` (${index}/${total})` : '';

    if (isUpdate && result.pageId) {
      DebugLogger.debug(`🔄 Updating existing entry for ${result.repositoryName}${progressText}...`);
      await this.notionService.updateDatabaseEntry(result.pageId, filteredProperties);
    } else {
      DebugLogger.debug(`✨ Creating new entry for ${result.repositoryName}${progressText}...`);
      await this.notionService.createDatabaseEntry(databaseId, filteredProperties);
    }
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
      // Get enhanced properties using the fixed getDatabaseProperties method
      const properties = await this.notionService.getDatabaseProperties(databaseId);
      const hasGradingSchema = NotionSchemaMapper.hasGradingProperties(properties);

      let missingProperties: string[] = [];
      if (!hasGradingSchema) {
        const missing = NotionSchemaMapper.getMissingGradingProperties(properties);
        missingProperties = Object.keys(missing);
      }

      // Get database metadata for title extraction
      const database = await this.notionService.getDatabaseMetadata(databaseId);
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
    DebugLogger.debug(`🔧 Updating existing database ${databaseId} for processing mode: ${options.processingMode || 'both'}`);

    try {
      DebugLogger.debug(`📋 Getting existing database properties...`);
      const existingProperties = await this.notionService.getDatabaseProperties(
        databaseId
      );

      DebugLogger.debug(`🔍 Checking for missing grading properties...`);
      const missingProperties = NotionSchemaMapper.getMissingGradingProperties(
        existingProperties,
        {
          skipGithubUrlColumn: !!options.skipGithubUrlColumn,
          processingMode: options.processingMode || 'both'
        }
      );

      if (Object.keys(missingProperties).length > 0) {
        console.log(`🔧 Adding ${Object.keys(missingProperties).length} required database columns...`);

        // Update database with missing properties
        await this.notionService.updateDatabaseSchema(
          databaseId,
          missingProperties
        );

        console.log(`✅ Database schema updated successfully`);
        return { databaseId, created: false, updated: true };
      }

      // Database already has all required properties
      DebugLogger.debug(`✅ Database already has all required properties - no update needed`);
      return { databaseId, created: false, updated: false };
    } catch (error: any) {
      console.log(`❌ Failed to update database schema: ${error.message}`);
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
