import { Client } from "@notionhq/client";
import { config } from "dotenv";
import { NotionTokenStorage } from "./notion-token-storage.js";
import { NotionDataSourceService } from "./data-source-service.js";
import { DebugLogger } from "../debug-logger.js";

// Load environment variables
config();

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  parent?: {
    type: string;
    pageId?: string;
    databaseId?: string;
    workspaceId?: string;
  };
}

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  properties: Record<string, any>;
}

interface ValidationResult {
  valid: boolean;
  timestamp: number;
  error?: string;
}

export class NotionService {
  private notion: Client;
  private storage: NotionTokenStorage;
  private dataSourceService: NotionDataSourceService | null = null;
  private validationCache: ValidationResult | null = null;
  private readonly validationCacheTtlMs: number = 1 * 60 * 1000; // 1 minute
  private validationInProgress: Promise<{ valid: boolean; error?: string }> | null = null;
  private isUsingExplicitToken: boolean = false;
  private currentToken: string;
  private failedDataSources: Set<string> = new Set(); // Track data sources that consistently fail

  constructor(accessToken?: string) {
    this.storage = new NotionTokenStorage();
    let token = accessToken;

    // Track whether we're using an explicit token or one from storage
    if (accessToken) {
      this.isUsingExplicitToken = true;
      token = accessToken;
      // Clear all caches when using a new explicit token
      this.clearValidationCache();
    } else {
      const saved = this.storage.getToken();
      token = saved?.access_token;
      this.isUsingExplicitToken = false;
    }

    if (!token) {
      throw new Error(
        "Notion access token is missing. Please authenticate via Notion OAuth in the CLI."
      );
    }

    this.currentToken = token;
    this.notion = new Client({
      auth: token,
      notionVersion: "2025-09-03"
    });

    DebugLogger.debug(`🔧 Notion Service initialized with API version: 2025-09-03`);

    // Initialize data source service for 2025-09-03 API features
    if (token) {
      this.dataSourceService = new NotionDataSourceService(token);
      DebugLogger.debug(`🔧 Data Source Service initialized and ready`);
    }
  }

  /**
   * Validate the current token by making a lightweight API call
   */
  async validateToken(): Promise<{ valid: boolean; error?: string }> {
    // Check if validation is already in progress
    if (this.validationInProgress) {
      DebugLogger.debug("🔄 Token validation already in progress, waiting...");
      return await this.validationInProgress;
    }

    // Check cache first
    const now = Date.now();
    if (this.validationCache && (now - this.validationCache.timestamp) < this.validationCacheTtlMs) {
      const ageSeconds = Math.round((now - this.validationCache.timestamp) / 1000);
      DebugLogger.debug(`📋 Using cached validation result (${ageSeconds}s old)`);
      DebugLogger.debug(`📋 Cache hit: validation result (${ageSeconds}s old, valid: ${this.validationCache.valid})`);
      return {
        valid: this.validationCache.valid,
        error: this.validationCache.error
      };
    }

    // Start validation
    this.validationInProgress = this.performTokenValidation();

    try {
      const result = await this.validationInProgress;

      // Cache the result
      this.validationCache = {
        valid: result.valid,
        timestamp: now,
        error: result.error
      };

      return result;
    } finally {
      this.validationInProgress = null;
    }
  }

  /**
   * Clear validation cache - useful when errors occur or tokens change
   */
  private clearValidationCache(): void {
    DebugLogger.debug("🧹 Clearing validation cache");
    this.validationCache = null;
    this.validationInProgress = null;
  }

  /**
   * Clear all caches - for troubleshooting and debugging
   */
  clearAllCaches(): void {
    DebugLogger.debug("🧹 Clearing all caches (validation + data source + failed data sources)");
    this.clearValidationCache();
    this.failedDataSources.clear();
    if (this.dataSourceService) {
      this.dataSourceService.clearCache();
    }
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus(): { validation: string; dataSource: string; failedDataSources: string } {
    const now = Date.now();
    let validationStatus = "No cache";
    let dataSourceStatus = "No service";
    let failedDataSourcesStatus = `${this.failedDataSources.size} failed`;

    if (this.validationCache) {
      const ageMs = now - this.validationCache.timestamp;
      const ageSeconds = Math.round(ageMs / 1000);
      validationStatus = `Cached (${ageSeconds}s old, valid: ${this.validationCache.valid})`;
    }

    if (this.dataSourceService) {
      dataSourceStatus = "Service initialized";
    }

    return { validation: validationStatus, dataSource: dataSourceStatus, failedDataSources: failedDataSourcesStatus };
  }

  private async performTokenValidation(): Promise<{ valid: boolean; error?: string }> {
    try {
      DebugLogger.debug("🔍 Validating Notion token...");

      // Create a promise that rejects after 15 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Token validation timed out after 15 seconds"));
        }, 15000);
      });

      // Race between the API call and the timeout
      await Promise.race([
        this.notion.users.me({}),
        timeoutPromise
      ]);

      DebugLogger.debug("✓ Token validation successful");
      return { valid: true };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.log("❌ Token validation failed:", errorMessage);

      if (errorMessage.includes("API token is invalid") ||
          errorMessage.includes("unauthorized") ||
          errorMessage.includes("timed out") ||
          error.code === "unauthorized") {
        // Only clear storage if we're using a token from storage, not an explicit token
        if (!this.isUsingExplicitToken) {
          DebugLogger.debug("🧹 Clearing invalid token from storage");
          this.storage.clearToken();
        } else {
          console.log("⚠️ Explicit token is invalid, but not clearing storage");
        }
        this.clearValidationCache(); // Clear cache for invalid tokens
        return {
          valid: false,
          error: "Token is invalid or expired. Please re-authenticate with Notion."
        };
      }

      return { valid: false, error: errorMessage };
    }
  }


  /**
   * Ensure we have a valid token before making API calls
   */
  private async ensureValidToken(): Promise<void> {
    const validation = await this.validateToken();
    if (!validation.valid) {
      throw new Error(validation.error || "Token validation failed");
    }
  }

  /**
   * Fetch all pages accessible to the integration
   * Uses 2025-09-03 API search
   */
  async getAllPages(): Promise<NotionPage[]> {
    await this.ensureValidToken();

    const pages: NotionPage[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.search({
        filter: {
          property: "object",
          value: "page",
        },
        start_cursor: nextCursor,
        page_size: 100,
      });

      for (const page of response.results) {
        if (page.object === "page" && "properties" in page) {
          const title = this.extractTitle(page);
          pages.push({
            id: page.id,
            title,
            url: page.url,
            lastEditedTime: page.last_edited_time,
            parent: page.parent,
          });
        }
      }

      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return pages;
  }

  /**
   * Fetch all databases accessible to the integration
   * Uses 2025-09-03 API with search
   */
  async getAllDatabases(): Promise<NotionDatabase[]> {
    await this.ensureValidToken();

    const databases: NotionDatabase[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.search({
        filter: {
          property: "object",
          value: "data_source" as any,
        },
        start_cursor: nextCursor,
        page_size: 100,
      });

      for (const dataSource of response.results) {
        if ((dataSource as any).object === "data_source") {
          const dsItem = dataSource as any;
          const databaseId = dsItem.parent?.database_id;

          if (databaseId) {
            // Use data source information directly (no redundant API calls)
            const title = this.extractTitle(dsItem) || 'Untitled Database';
            databases.push({
              id: databaseId, // Use database ID, not data source ID for UI compatibility
              title,
              url: `https://notion.so/${databaseId.replace(/-/g, '')}`,
              lastEditedTime: dsItem.last_edited_time || new Date().toISOString(),
              properties: dsItem.properties || {},
            });
          } else {
            console.log(`⚠️ Data source has no parent database_id: ${dsItem.id}`);
          }
        }
      }

      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return databases;
  }

  /**
   * Fetch content of a specific page or database
   */
  async getPageContent(pageId: string): Promise<any> {
    await this.ensureValidToken();
    try {
      // First try to get it as a page
      const page = await this.notion.pages.retrieve({ page_id: pageId });
      const blocks = await this.getPageBlocks(pageId);

      return {
        page,
        blocks,
        type: "page",
      };
    } catch (error: any) {
      // If it fails and mentions it's a database, try to get database metadata
      if (
        error.code === "validation_error" &&
        error.message.includes("database")
      ) {
        const database = await this.getDatabaseMetadata(pageId);
        const entries = await this.queryDatabase(pageId);

        return {
          database,
          entries,
          type: "database",
        };
      }
      throw error;
    }
  }

  /**
   * Fetch database content directly
   */
  async getDatabaseContent(databaseId: string): Promise<any> {
    try {
      DebugLogger.debug(`📊 Starting database content fetch for: ${databaseId}`);

      const database = await this.getDatabaseMetadata(databaseId);
      DebugLogger.debug(`✓ Database metadata retrieved successfully`);

      // Use the enhanced data source service for better fallback handling
      DebugLogger.debug(`🔍 Querying database entries using data source service...`);

      if (!this.dataSourceService) {
        throw new Error('Data source service not initialized. Please ensure authentication is complete.');
      }

      const entries = await this.dataSourceService.queryDatabase(databaseId);
      DebugLogger.debug(`✓ Database entries retrieved: ${entries.length} results`);

      // Get enhanced schema from data sources and merge with database metadata
      const combinedSchema = await this.dataSourceService.getCombinedSchema(databaseId);
      DebugLogger.debug(`✓ Combined schema retrieved: ${Object.keys(combinedSchema).length} properties`);

      // Enhanced database metadata with combined schema
      const enhancedDatabase = {
        ...database,
        properties: {
          ...(database.properties || {}),
          ...combinedSchema
        }
      };

      return {
        database: enhancedDatabase,
        entries,
        type: "database",
      };
    } catch (error: any) {
      DebugLogger.debug(`❌ Failed to get database content for ${databaseId}:`, error.message);

      // Provide user-friendly error messages
      if (error.message.includes('invalid_request_url')) {
        throw new Error(`The database query failed because the new API endpoints are not yet available. Please try again later or contact support if this persists.`);
      }

      if (error.message.includes('object_not_found')) {
        throw new Error(`Database not found or access denied. Please ensure the database is shared with your Notion integration.`);
      }

      if (error.message.includes('unauthorized') || error.message.includes('403')) {
        throw new Error(`Access denied to this database. Please ensure your Notion integration has permission to access this content.`);
      }

      if (error.message.includes('Token validation failed') || error.message.includes('Token is invalid')) {
        throw new Error(`Your Notion authentication has expired. Please re-authenticate and try again.`);
      }

      // For any other errors, include helpful context
      throw new Error(`Failed to fetch database content: ${error.message}. This may be a temporary issue - please try again.`);
    }
  }

  /**
   * Fetch page content directly
   */
  async getPageContentDirect(pageId: string): Promise<any> {
    const page = await this.notion.pages.retrieve({ page_id: pageId });
    const blocks = await this.getPageBlocks(pageId);

    return {
      page,
      blocks,
      type: "page",
    };
  }

  /**
   * Fetch database metadata
   * Prefer databases.retrieve and fall back to data source discovery when needed
   */
  async getDatabaseMetadata(databaseId: string): Promise<any> {
    await this.ensureValidToken();

    try {
      // Prefer the official databases.retrieve endpoint when available
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      }) as any;

      // Ensure we have a data_source_id for compatibility
      // Check both data_sources array and data_source_id field
      if (!database.data_source_id) {
        // First check if we have data_sources array
        if (database.data_sources && database.data_sources.length > 0) {
          return {
            ...database,
            data_source_id: database.data_sources[0].id
          };
        }

        // Otherwise try to find it via data source service
        if (this.dataSourceService) {
          const dataSourceId = await this.dataSourceService.findDataSourceForDatabase(databaseId);
          if (dataSourceId) {
            return {
              ...database,
              data_source_id: dataSourceId
            };
          }
        }
      }

      return database;
    } catch (retrievalError: any) {
      console.log(`⚠️ Standard database retrieve failed for ${databaseId}: ${retrievalError.message}`);

      // Use data source service to get database metadata
      if (!this.dataSourceService) {
        throw new Error('Data source service not available. Please re-authenticate.');
      }

      try {
        const metadata = await this.dataSourceService.getDatabaseMetadata(databaseId);
        return metadata;
      } catch (error: any) {
        // If data source approach fails, try to find the database in our discovery results
        console.log(`⚠️ Data source metadata failed for ${databaseId}, trying discovery fallback: ${error.message}`);

        try {
          const databases = await this.getAllDatabases();
          const foundDatabase = databases.find(db => db.id === databaseId);

          if (foundDatabase) {
            // Create a metadata object from discovery results
            return {
              id: foundDatabase.id,
              title: [{ plain_text: foundDatabase.title }],
              properties: foundDatabase.properties,
              last_edited_time: foundDatabase.lastEditedTime,
              url: foundDatabase.url,
              data_source_id: null, // Will be filled by data source service if available
            };
          }
        } catch (discoveryError: any) {
          console.log(`⚠️ Discovery fallback also failed: ${discoveryError.message}`);
        }

        if (error.code === 'object_not_found') {
          throw new Error(`Database ${databaseId} not found. Please check the database ID and ensure you have access to it.`);
        }
        if (error.code === 'unauthorized') {
          throw new Error(`Access denied to database ${databaseId}. Please check your Notion integration permissions.`);
        }
        throw new Error(`Failed to retrieve database metadata: ${error.message}`);
      }

      // If all options fail, surface the original retrieval error
      if (retrievalError.code === 'object_not_found') {
        throw new Error(`Database ${databaseId} not found. Please check the database ID and ensure you have access to it.`);
      }
      if (retrievalError.code === 'unauthorized') {
        throw new Error(`Access denied to database ${databaseId}. Please check your Notion integration permissions.`);
      }
      throw new Error(`Failed to retrieve database metadata: ${retrievalError.message}`);
    }
  }

  /**
   * Fetch all blocks from a page
   */
  async getPageBlocks(pageId: string): Promise<any[]> {
    const blocks: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.blocks.children.list({
        block_id: pageId,
        start_cursor: nextCursor,
        page_size: 100,
      });

      blocks.push(...response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return blocks;
  }

  /**
   * Query a database
   * Uses 2025-09-03 API with data source query endpoint
   */
  async queryDatabase(
    databaseId: string,
    filter?: any,
    sorts?: any[]
  ): Promise<any[]> {
    await this.ensureValidToken();

    // Helper function to query using search API as fallback
    const queryUsingSearchAPI = async (): Promise<any[]> => {
      DebugLogger.debug(`🔍 Using search API fallback for database ${databaseId}`);
      const results: any[] = [];
      let hasMore = true;
      let nextCursor: string | undefined;

      while (hasMore) {
        const response = await this.notion.search({
          filter: {
            property: "object",
            value: "page"
          },
          page_size: 100,
          start_cursor: nextCursor
        });

        // Filter results to only include pages from this specific database
        const pagesFromDatabase = response.results.filter(result => {
          if (result.object !== 'page') return false;
          const parent = (result as any).parent;
          return parent && parent.type === 'database_id' && parent.database_id === databaseId;
        });
        results.push(...pagesFromDatabase);
        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      return results;
    };

    try {
      // First get the database to obtain data_source_id
      DebugLogger.debug(`🔍 Getting database metadata for ${databaseId}`);
      const database = await this.getDatabaseMetadata(databaseId);
      const dataSourceId = (database as any).data_source_id;

      if (!dataSourceId) {
        // No data source ID, use search API
        DebugLogger.debug(`📊 No data source found, using search API for ${databaseId}`);
        const results = await queryUsingSearchAPI();
        DebugLogger.debug(`✓ Successfully queried via search: ${results.length} results`);
        return results;
      }

      // Check if this data source has consistently failed before
      if (this.failedDataSources.has(dataSourceId)) {
        DebugLogger.debug(`⏭️ Skipping known failed data source ${dataSourceId}, using search API`);
        DebugLogger.debug(`📊 Skipping known failed data source, using search API for ${databaseId}`);
        const results = await queryUsingSearchAPI();
        DebugLogger.debug(`✓ Successfully queried via search fallback: ${results.length} results`);
        return results;
      }

      // Try data source query first
      DebugLogger.debug(`🔍 Attempting data source query for ${dataSourceId}`);

      try {
        const results: any[] = [];
        let hasMore = true;
        let nextCursor: string | undefined;
        let pageCount = 0;

        while (hasMore) {
          const requestBody = {
            filter,
            sorts,
            page_size: 100,
            start_cursor: nextCursor
          };

          DebugLogger.debug(`🔍 Data source query request:`, {
            path: `/v1/data_sources/${dataSourceId}/query`,
            method: 'post',
            dataSourceId,
            bodyKeys: Object.keys(requestBody),
            hasFilter: !!filter,
            hasSorts: !!sorts
          });

          const response = await this.notion.request({
            path: `/v1/data_sources/${dataSourceId}/query`,
            method: 'post',
            body: requestBody
          }) as any;

          const pageResults = (response as any).results || [];
          results.push(...pageResults);
          hasMore = (response as any).has_more || false;
          nextCursor = (response as any).next_cursor || undefined;
          pageCount++;

          DebugLogger.debug(`✓ Retrieved page ${pageCount} with ${pageResults.length} results`);
        }

        DebugLogger.debug(`✓ Successfully queried via data source: ${results.length} results`);
        return results;

      } catch (dataSourceError: any) {
        // Data source query failed, try search fallback
        console.log(`⚠️ Data source query failed (${dataSourceError.code}), falling back to search API`);

        // Clear validation cache if we get invalid_request_url errors - may indicate stale cache
        if (dataSourceError.code === 'invalid_request_url') {
          DebugLogger.debug(`🧹 Clearing cache due to invalid_request_url error. Cache status: ${JSON.stringify(this.getCacheStatus())}`);
          this.clearValidationCache();

          // Track this data source as failed to avoid retrying
          if (dataSourceId) {
            this.failedDataSources.add(dataSourceId);
            DebugLogger.debug(`❌ Added data source ${dataSourceId} to failed list (${this.failedDataSources.size} total failed)`);
          }
        }

        try {
          const results = await queryUsingSearchAPI();
          DebugLogger.debug(`✓ Successfully queried via search fallback: ${results.length} results`);
          return results;
        } catch (searchError: any) {
          // Both methods failed
          console.error(`❌ Both query methods failed`);
          console.error(`  Data source error: ${dataSourceError.message}`);
          console.error(`  Search API error: ${searchError.message}`);

          // Throw the more relevant error
          if (searchError.code === 'unauthorized') {
            throw new Error(`Access denied to database ${databaseId}. Please check your Notion integration permissions.`);
          }
          if (searchError.code === 'object_not_found') {
            throw new Error(`Database ${databaseId} not found or has been deleted.`);
          }

          throw new Error(`Unable to query database ${databaseId}. Data source query failed: ${dataSourceError.message}`);
        }
      }

    } catch (error: any) {
      // Handle top-level errors (like getDatabaseMetadata failures)
      console.error(`❌ Failed to query database ${databaseId}:`, error.message);
      throw new Error(`Database query failed: ${error.message}`);
    }
  }

  /**
   * Create a new database with specified properties
   */
  async createDatabase(
    title: string,
    properties: Record<string, any>,
    parentPageId?: string
  ): Promise<any> {
    if (!parentPageId) {
      throw new Error(
        "Parent page ID is required to create a database. Notion doesn't support creating databases in workspace root."
      );
    }

    const response = await this.notion.request({
      path: '/v1/databases',
      method: 'post',
      body: {
        parent: {
          type: "page_id",
          page_id: parentPageId,
        },
        title: [
          {
            type: "text",
            text: {
              content: title,
            },
          },
        ],
        properties,
      }
    });

    return response;
  }

  /**
   * Update database properties (add new columns)
   */
  async updateDatabaseSchema(
    databaseId: string,
    properties: Record<string, any>
  ): Promise<any> {
    await this.ensureValidToken();

    if (Object.keys(properties).length === 0) {
      DebugLogger.debugDataSource(`ℹ️ No properties to add to database ${databaseId}`);
      return { success: true, message: "No properties to add" };
    }

    DebugLogger.debugDataSource(`🔧 Updating database schema using 2025-09-03 Data Source API`);
    DebugLogger.debugDataSource(`📋 Adding ${Object.keys(properties).length} new properties:`, Object.keys(properties));

    // Get database metadata to access data sources
    const database = await this.getDatabaseMetadata(databaseId);

    // Extract data source IDs - databases can have multiple data sources
    const dataSourceIds = this.getDataSourceIds(database);

    if (dataSourceIds.length === 0) {
      throw new Error(`No data sources found for database ${databaseId}. Cannot update schema without data source access.`);
    }

    DebugLogger.debugDataSource(`📊 Found ${dataSourceIds.length} data source(s) for database ${databaseId}`);

    const maxRetries = 3;
    const results: any[] = [];
    const errors: string[] = [];

    // Update schema for each data source
    for (const dataSourceId of dataSourceIds) {
      let lastError: any;
      let success = false;

      DebugLogger.debugDataSource(`🔧 Updating schema for data source: ${dataSourceId}`);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          DebugLogger.debugDataSource(`🔧 Updating data source ${dataSourceId} (attempt ${attempt}/${maxRetries})`);

          // Use the new Data Source API
          const response = await this.notion.dataSources.update({
            data_source_id: dataSourceId,
            properties: properties
          });

          DebugLogger.debugDataSource(`✅ Data source ${dataSourceId} schema updated successfully on attempt ${attempt}`);
          results.push(response);
          success = true;
          break;

        } catch (error: any) {
          lastError = error;
          DebugLogger.debugDataSource(`❌ Data source schema update failed on attempt ${attempt}:`, error.message);
          DebugLogger.debugDataSource(`❌ Error code:`, error.code);
          DebugLogger.debugDataSource(`❌ Data source ID:`, dataSourceId);

          // If this is a final failure or a non-retryable error, break
          if (attempt === maxRetries || this.isNonRetryableError(error)) {
            break;
          }

          // Wait before retrying (exponential backoff)
          const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          DebugLogger.debugDataSource(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!success) {
        const errorMessage = this.getDataSourceErrorMessage(lastError);
        errors.push(`Data source ${dataSourceId}: ${errorMessage}`);
        DebugLogger.debugDataSource(`❌ All ${maxRetries} attempts failed for data source ${dataSourceId}`);
      }
    }

    // Check if any data source updates succeeded
    if (results.length > 0) {
      DebugLogger.debugDataSource(`✅ Successfully updated ${results.length}/${dataSourceIds.length} data sources`);

      // Verify the columns were actually created by checking the updated database
      await this.verifyColumnsCreated(databaseId, Object.keys(properties));

      return {
        success: true,
        updated_data_sources: results.length,
        total_data_sources: dataSourceIds.length,
        results: results,
        errors: errors
      };
    }

    // All data source updates failed
    DebugLogger.debugDataSource(`❌ All data source schema updates failed`);
    throw new Error(`Database schema update failed: All ${dataSourceIds.length} data source(s) failed to update. Errors: ${errors.join('; ')}`);
  }

  /**
   * Extract data source IDs from database metadata
   */
  private getDataSourceIds(database: any): string[] {
    const dataSourceIds: string[] = [];

    // Check data_sources array (primary source in 2025-09-03 API)
    if (database.data_sources && Array.isArray(database.data_sources)) {
      dataSourceIds.push(...database.data_sources.map((ds: any) => ds.id));
    }

    // Check legacy data_source_id field (fallback)
    if (database.data_source_id && !dataSourceIds.includes(database.data_source_id)) {
      dataSourceIds.push(database.data_source_id);
    }

    return dataSourceIds;
  }

  /**
   * Get user-friendly error message for data source errors
   */
  private getDataSourceErrorMessage(error: any): string {
    if (!error) return 'Unknown error';

    switch (error.code) {
      case 'invalid_request_url':
        return 'Invalid data source API endpoint. This may indicate an API version compatibility issue.';
      case 'unauthorized':
        return 'Unauthorized. Please ensure you have permission to edit this data source.';
      case 'object_not_found':
        return 'Data source not found. The data source may have been deleted or is not accessible.';
      case 'rate_limited':
        return 'Rate limited by Notion API. Please try again in a few minutes.';
      case 'validation_error':
        return 'Invalid property configuration. Please check the property definitions.';
      default:
        return error.message || 'Unknown error occurred';
    }
  }

  /**
   * Verify that columns were actually created in the database
   */
  private async verifyColumnsCreated(databaseId: string, expectedColumns: string[]): Promise<void> {
    try {
      DebugLogger.debugDataSource(`🔍 Verifying columns were created: ${expectedColumns.join(', ')}`);

      // Wait a moment for Notion to process the schema change
      await new Promise(resolve => setTimeout(resolve, 1000));

      const properties = await this.getDatabaseProperties(databaseId);
      const existingColumns = Object.keys(properties);

      const missingColumns = expectedColumns.filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        DebugLogger.debugDataSource(`❌ Columns were not created: ${missingColumns.join(', ')}`);
        throw new Error(`Schema update appeared to succeed but columns were not created: ${missingColumns.join(', ')}`);
      }

      DebugLogger.debugDataSource(`✅ All columns verified as created: ${expectedColumns.join(', ')}`);
    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Column verification failed:`, error.message);
      throw new Error(`Failed to verify column creation: ${error.message}`);
    }
  }

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: any): boolean {
    const nonRetryableCodes = [
      'unauthorized',
      'object_not_found',
      'invalid_request_url',
      'validation_error',
      'invalid_request'
    ];
    return nonRetryableCodes.includes(error.code);
  }

  /**
   * Create a new entry in a database
   */
  async createDatabaseEntry(
    databaseId: string,
    properties: Record<string, any>
  ): Promise<any> {
    await this.ensureValidToken();

    // Try to find the data source ID for the database (2025-09-03 API)
    let dataSourceId: string | null = null;
    if (this.dataSourceService) {
      try {
        dataSourceId = await this.dataSourceService.findDataSourceForDatabase(databaseId);
        DebugLogger.debugDataSource(`🔍 Found data source ID for page creation: ${dataSourceId}`);
      } catch (error: any) {
        DebugLogger.debugDataSource(`⚠️ Could not find data source ID, falling back to database ID: ${error.message}`);
      }
    }

    // Try data source approach first (2025-09-03 API)
    if (dataSourceId) {
      try {
        DebugLogger.debugDataSource(`📝 Creating page with data source parent: ${dataSourceId}`);
        const response = await this.notion.pages.create({
          parent: {
            type: "data_source_id",
            data_source_id: dataSourceId,
          },
          properties,
        });
        DebugLogger.debugDataSource(`✅ Page created successfully using data source API`);
        return response;
      } catch (dataSourceError: any) {
        DebugLogger.debugDataSource(`❌ Data source page creation failed: ${dataSourceError.message}, falling back to database ID`);
        // Fall through to database ID approach
      }
    }

    // Fallback to database ID approach (legacy API)
    try {
      DebugLogger.debugDataSource(`📝 Creating page with database parent: ${databaseId}`);
      const response = await this.notion.pages.create({
        parent: {
          type: "database_id",
          database_id: databaseId,
        },
        properties,
      });
      DebugLogger.debugDataSource(`✅ Page created successfully using database ID API`);
      return response;
    } catch (databaseError: any) {
      DebugLogger.debugDataSource(`❌ Database page creation failed: ${databaseError.message}`);
      throw new Error(`Failed to create database entry: ${databaseError.message}`);
    }
  }

  /**
   * Update an existing database entry
   */
  async updateDatabaseEntry(
    pageId: string,
    properties: Record<string, any>
  ): Promise<any> {
    const response = await this.notion.pages.update({
      page_id: pageId,
      properties,
    });

    return response;
  }

  /**
   * Check if a database has specific properties
   * Uses 2025-09-03 API with data source context when available
   */
  async getDatabaseProperties(
    databaseId: string
  ): Promise<Record<string, any>> {
    try {
      const database = await this.getDatabaseMetadata(databaseId);

      // Get enhanced schema from data sources if available
      if (this.dataSourceService) {
        try {
          const combinedSchema = await this.dataSourceService.getCombinedSchema(databaseId);

          // Merge basic database properties with enhanced schema
          return {
            ...(database.properties || {}),
            ...combinedSchema
          };
        } catch (schemaError: any) {
          DebugLogger.debugDataSource(`⚠️ Failed to get combined schema, using basic properties: ${schemaError.message}`);
          // Fall back to basic properties if enhanced schema fails
          return database.properties || {};
        }
      }

      // Fallback to basic database properties with null safety
      return database.properties || {};
    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Failed to get database properties for ${databaseId}: ${error.message}`);
      // Return empty object to prevent "Cannot convert undefined or null to object" errors
      return {};
    }
  }

  /**
   * Extract title from page or database object
   */
  private extractTitle(item: any): string {
    if (item.properties?.title) {
      const titleProperty = item.properties.title;
      if (titleProperty.title && titleProperty.title.length > 0) {
        return titleProperty.title[0].plain_text || "Untitled";
      }
    }

    if (item.properties?.Name) {
      const nameProperty = item.properties.Name;
      if (nameProperty.title && nameProperty.title.length > 0) {
        return nameProperty.title[0].plain_text || "Untitled";
      }
    }

    // Check if it's a database with a title
    if (item.title && item.title.length > 0) {
      return item.title[0].plain_text || "Untitled";
    }

    return "Untitled";
  }

  /**
   * Search across all content using 2025-09-03 API
   */
  async searchAllDataSources(query: string, filter?: any): Promise<any[]> {
    await this.ensureValidToken();

    const results: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.search({
        query,
        filter,
        start_cursor: nextCursor,
        page_size: 100,
      });

      results.push(...response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return results;
  }

  /**
   * Get data source service instance
   */
  getDataSourceService(): NotionDataSourceService | null {
    return this.dataSourceService;
  }

}
