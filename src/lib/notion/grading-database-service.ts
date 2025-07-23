import { NotionService } from "./notion-service.js";
import { NotionSchemaMapper } from "./schema-mapper.js";
import { GradingResult } from "../file-saver.js";

export interface DatabaseCreationOptions {
  title?: string;
  parentPageId?: string;
}

export class GradingDatabaseService {
  private notionService: NotionService;

  constructor(apiKey?: string) {
    this.notionService = new NotionService(apiKey);
  }

  /**
   * Ensure grading database exists with proper schema
   * Creates new database or updates existing one with missing columns
   */
  async ensureGradingDatabase(
    sourceDatabaseId?: string,
    options: DatabaseCreationOptions & { skipGithubUrlColumn?: string } = {}
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
   * Save grading results to database
   */
  async saveGradingResults(
    databaseId: string,
    results: GradingResult[],
    githubUrlColumnName?: string
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(databaseId);
    const titlePropertyName = Object.keys(databaseProperties).find(
      key => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    for (const result of results) {
      try {
        const isUpdate = !!result.pageId;
        const allProperties = NotionSchemaMapper.transformGradingDataToNotionProperties(
          result.gradingData,
          result.repositoryName,
          result.githubUrl,
          titlePropertyName,
          githubUrlColumnName,
          isUpdate
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
          await this.notionService.updateDatabaseEntry(result.pageId, filteredProperties);
        } else {
          // Create new row
          await this.notionService.createDatabaseEntry(databaseId, filteredProperties);
        }
        success++;
      } catch (error: any) {
        failed++;
        errors.push(`Failed to save ${result.repositoryName}: ${error.message}`);
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
    githubUrlColumnName?: string
  ): Promise<any> {
    // Get the existing database properties
    const databaseProperties = await this.notionService.getDatabaseProperties(databaseId);
    const titlePropertyName = Object.keys(databaseProperties).find(
      key => databaseProperties[key].type === "title"
    );
    const availableProperties = new Set(Object.keys(databaseProperties));

    const isUpdate = !!result.pageId;
    const allProperties = NotionSchemaMapper.transformGradingDataToNotionProperties(
      result.gradingData,
      result.repositoryName,
      result.githubUrl,
      titlePropertyName,
      githubUrlColumnName,
      isUpdate
    );

    // Only include properties that actually exist in the database
    const filteredProperties: Record<string, any> = {};
    for (const [key, value] of Object.entries(allProperties)) {
      if (availableProperties.has(key)) {
        filteredProperties[key] = value;
      }
    }

    if (isUpdate && result.pageId) {
      return await this.notionService.updateDatabaseEntry(result.pageId, filteredProperties);
    } else {
      return await this.notionService.createDatabaseEntry(databaseId, filteredProperties);
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
      const hasGradingSchema = NotionSchemaMapper.hasGradingProperties(database.properties);
      
      let missingProperties: string[] = [];
      if (!hasGradingSchema) {
        const missing = NotionSchemaMapper.getMissingGradingProperties(database.properties);
        missingProperties = Object.keys(missing);
      }

      const title = database.title && database.title.length > 0 
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
    options: { skipGithubUrlColumn?: string } = {}
  ): Promise<{ databaseId: string; created: boolean; updated: boolean }> {
    try {
      const existingProperties = await this.notionService.getDatabaseProperties(databaseId);
      const missingProperties = NotionSchemaMapper.getMissingGradingProperties(existingProperties, {
        skipGithubUrlColumn: !!options.skipGithubUrlColumn
      });
      
      if (Object.keys(missingProperties).length > 0) {
        // Update database with missing properties
        await this.notionService.updateDatabaseSchema(databaseId, missingProperties);
        return { databaseId, created: false, updated: true };
      }
      
      // Database already has all required properties
      return { databaseId, created: false, updated: false };
    } catch (error: any) {
      throw new Error(`Failed to update database schema: ${error.message}`);
    }
  }

  private async createNewGradingDatabase(
    options: DatabaseCreationOptions
  ): Promise<{ databaseId: string; created: boolean; updated: boolean }> {
    const title = options.title || `Homework Grading Results - ${new Date().toISOString().split('T')[0]}`;
    const properties = NotionSchemaMapper.generateGradingDatabaseProperties();

    try {
      // If no parent page ID provided, we need to get one from the user or use a default approach
      if (!options.parentPageId) {
        throw new Error("Creating a new database requires a parent page ID. Please select a page from your Notion workspace to create the database under.");
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