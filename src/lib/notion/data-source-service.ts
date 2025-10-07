import { Client } from "@notionhq/client";
import { DebugLogger } from "../debug-logger.js";

export interface NotionDataSource {
  id: string;
  name: string;
  type: string;
  workspace_id: string;
}

export interface DatabaseInfo {
  data_source_id: string;
  database_id: string;
  name: string;
  properties: Record<string, any>;
}

/**
 * Service for discovering and managing Notion data sources
 * Uses 2025-09-03 API for database operations
 */
export class NotionDataSourceService {
  private notion: Client;
  private accessToken: string;
  private dataSourceCache: Map<string, NotionDataSource[]> = new Map();
  private dataSourceIdCache: Map<string, string | null> = new Map(); // Cache for database ID -> data source ID mapping
  private readonly cacheTtlMs: number = 30 * 60 * 1000; // 30 minutes

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.notion = new Client({
      auth: accessToken,
      notionVersion: "2025-09-03"
    });

    DebugLogger.debugDataSource(`🔧 Data Source Service initialized with Notion API version: 2025-09-03`);
  }

  /**
   * Get all databases and extract their data sources
   */
  async getAllDatabases(): Promise<DatabaseInfo[]> {
    try {
      DebugLogger.debugQuery("🔍 Discovering databases using search API...");

      const databases: DatabaseInfo[] = [];
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

            // Extract database information from data source object
            const databaseId = dsItem.parent?.database_id;
            if (databaseId) {
              // Use data source information directly (no redundant API calls)
              databases.push({
                data_source_id: dsItem.id, // This is the data source ID
                database_id: databaseId,   // This is the database ID from parent
                name: this.extractDatabaseName(dsItem) || 'Untitled Database',
                properties: dsItem.properties || {}
              });
            } else {
            }
          }
        }

        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      DebugLogger.debugQuery(`✓ Found ${databases.length} database(s)`);
      return databases;
    } catch (error: any) {
      console.error(`❌ Failed to discover databases: ${error.message}`);
      return [];
    }
  }



  /**
   * Find data source ID for a given database ID
   */
  async findDataSourceForDatabase(databaseId: string): Promise<string | null> {
    try {
      // Check cache first
      if (this.dataSourceIdCache.has(databaseId)) {
        const cachedResult = this.dataSourceIdCache.get(databaseId);
        DebugLogger.debugDataSource(`💾 Using cached data source ID for database ${databaseId}: ${cachedResult}`);
        return cachedResult ?? null;
      }

      DebugLogger.debugDataSource(`🔍 Looking for data source for database: ${databaseId}`);

      // First try the SDK method which might have data_sources
      DebugLogger.debugDataSource(`📡 Trying SDK databases.retrieve() method...`);
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      }) as any;

      DebugLogger.debugDataSource(`📊 Database object keys:`, Object.keys(database));
      DebugLogger.debugDataSource(`🔎 Has data_sources property:`, !!database.data_sources);

      if (database.data_sources) {
        DebugLogger.debugDataSource(`📋 Data sources array length:`, database.data_sources.length);
        DebugLogger.debugDataSource(`📋 Data sources content:`, database.data_sources);
      }

      // Check for data_sources array (2025-09-03 API)
      if (database.data_sources && database.data_sources.length > 0) {
        const dataSourceId = database.data_sources[0].id;
        DebugLogger.debugDataSource(`✅ Found data source ID via SDK: ${dataSourceId}`);

        // Validate data source ID format
        if (this.validateDataSourceId(dataSourceId)) {
          // Cache the result
          this.dataSourceIdCache.set(databaseId, dataSourceId);
          return dataSourceId;
        } else {
          DebugLogger.debugDataSource(`❌ Invalid data source ID format: ${dataSourceId}`);
        }
      }

      // Fallback: Try raw request with 2025-09-03 version to get data_sources
      DebugLogger.debugDataSource(`🔄 Trying raw request fallback...`);
      try {
        const response = await this.notion.request({
          path: `/v1/databases/${databaseId}`,
          method: 'get'
        }) as any;

        DebugLogger.debugDataSource(`📊 Raw request response keys:`, Object.keys(response));
        DebugLogger.debugDataSource(`🔎 Raw response has data_sources:`, !!response.data_sources);

        if (response.data_sources) {
          DebugLogger.debugDataSource(`📋 Raw data sources:`, response.data_sources);
        }

        if (response.data_sources && response.data_sources.length > 0) {
          const dataSourceId = response.data_sources[0].id;
          DebugLogger.debugDataSource(`✅ Found data source ID via raw request: ${dataSourceId}`);

          // Validate data source ID format
          if (this.validateDataSourceId(dataSourceId)) {
            // Cache the result
            this.dataSourceIdCache.set(databaseId, dataSourceId);
            return dataSourceId;
          } else {
            DebugLogger.debugDataSource(`❌ Invalid data source ID format from raw request: ${dataSourceId}`);
          }
        }
      } catch (rawError: any) {
        DebugLogger.debugDataSource(`❌ Raw request failed:`, rawError.message);
        DebugLogger.debugDataSource(`❌ Raw request error code:`, rawError.code);
      }

      DebugLogger.debugDataSource(`❌ No valid data source found for database: ${databaseId}`);
      // Cache the null result to avoid repeated lookups
      this.dataSourceIdCache.set(databaseId, null);
      return null;
    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Error in findDataSourceForDatabase:`, error.message);
      DebugLogger.debugDataSource(`❌ Error code:`, error.code);

      if (error.code === 'object_not_found') {
        console.error(`❌ Database ${databaseId} not found`);
      } else if (error.code === 'unauthorized') {
        console.error(`❌ Access denied to database ${databaseId}`);
      } else {
        console.error(`❌ Failed to get data source for database ${databaseId}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Get database metadata using 2025-09-03 API
   */
  async getDatabaseMetadata(databaseId: string): Promise<any> {
    const database = await this.notion.databases.retrieve({
      database_id: databaseId
    });

    return database;
  }

  /**
   * Query database using the proper 2025-09-03 API approach
   * Uses database.data_sources array directly instead of complex discovery
   */
  async queryDatabase(
    databaseId: string,
    filter?: any,
    sorts?: any[]
  ): Promise<any> {
    const startTime = Date.now();

    try {
      DebugLogger.debugDataSource(`🚀 Querying database using 2025-09-03 data source API: ${databaseId}`);

      // Step 1: Get the database object to retrieve its data_sources array
      DebugLogger.debugDataSource(`📡 Step 1: Retrieving database metadata...`);
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      }) as any;

      DebugLogger.debugDataSource(`📊 Database object keys:`, Object.keys(database));
      DebugLogger.debugDataSource(`🔎 Has data_sources property:`, !!database.data_sources);

      if (!database.data_sources || database.data_sources.length === 0) {
        DebugLogger.debugDataSource(`❌ No data sources found for database ${databaseId}`);
        DebugLogger.debugDataSource(`🔄 Falling back to Search API method...`);
        return await this.queryDatabaseUsingSearch(databaseId, startTime);
      }

      DebugLogger.debugDataSource(`📋 Found ${database.data_sources.length} data source(s):`, database.data_sources.map((ds: any) => ds.id));

      // Step 2: Get schema and query each data source, then combine
      let combinedSchema: any = {};
      const allResults: any[] = [];

      for (let i = 0; i < database.data_sources.length; i++) {
        const dataSource = database.data_sources[i];
        const dataSourceId = dataSource.id;

        DebugLogger.debugDataSource(`📡 Step 2.${i + 1}: Getting schema and querying data source ${dataSourceId}...`);

        try {
          // Get schema first
          const schema = await this.getDataSourceSchema(dataSourceId);
          DebugLogger.debugDataSource(`✅ Data source ${dataSourceId} schema retrieved with ${Object.keys(schema.properties || {}).length} properties`);

          // Merge properties from this data source
          if (schema.properties) {
            combinedSchema = { ...combinedSchema, ...schema.properties };
          }

          // Then get the content
          const dataSourceResults = await this.queryDataSource(dataSourceId, filter, sorts);
          DebugLogger.debugDataSource(`✅ Data source ${dataSourceId} returned ${dataSourceResults.length} results`);
          allResults.push(...dataSourceResults);
        } catch (dataSourceError: any) {
          console.log(`❌ Failed to query data source ${dataSourceId}: ${dataSourceError.message}`);
          DebugLogger.debugDataSource(`❌ Error code: ${dataSourceError.code}`);
          DebugLogger.debugDataSource(`❌ Full error:`, dataSourceError);
          // Continue with other data sources instead of failing completely
        }
      }

      // If all data sources failed to return results, fall back to Search API
      if (allResults.length === 0 && database.data_sources.length > 0) {
        console.log(`⚠️ All ${database.data_sources.length} data source(s) returned 0 results or failed`);
        console.log(`🔄 Falling back to Search API...`);
        return await this.queryDatabaseUsingSearch(databaseId, startTime);
      }

      const duration = Date.now() - startTime;
      DebugLogger.debugDataSource(`✅ Database query completed in ${duration}ms. Total results from ${database.data_sources.length} data source(s): ${allResults.length}`);
      DebugLogger.debugDataSource(`📋 Combined schema properties: ${Object.keys(combinedSchema).length}`);

      // Return just the entries array - NotionService will handle structure creation
      return allResults;

    } catch (error: any) {
      const duration = Date.now() - startTime;
      DebugLogger.debugDataSource(`❌ Database query failed after ${duration}ms:`, error.message);
      DebugLogger.debugDataSource(`🔄 Attempting Search API fallback...`);

      // Final fallback to Search API
      try {
        return await this.queryDatabaseUsingSearch(databaseId, startTime);
      } catch (searchError: any) {
        DebugLogger.debugDataSource(`❌ Search API fallback also failed: ${searchError.message}`);
        throw new Error(`Failed to query database ${databaseId}: ${error.message}`);
      }
    }
  }

  /**
   * Get combined schema from all data sources for a database
   */
  async getCombinedSchema(databaseId: string): Promise<Record<string, any>> {
    try {
      DebugLogger.debugDataSource(`🔍 Getting combined schema for database: ${databaseId}`);

      // Get the database object to retrieve its data_sources array
      const database = await this.notion.databases.retrieve({
        database_id: databaseId
      }) as any;

      if (!database.data_sources || database.data_sources.length === 0) {
        DebugLogger.debugDataSource(`❌ No data sources found for database ${databaseId}`);
        return {};
      }

      DebugLogger.debugDataSource(`📋 Found ${database.data_sources.length} data source(s) for schema retrieval`);

      // Combine schemas from all data sources
      let combinedSchema: Record<string, any> = {};

      for (const dataSource of database.data_sources) {
        const dataSourceId = dataSource.id;
        try {
          const schema = await this.getDataSourceSchema(dataSourceId);
          if (schema.properties) {
            combinedSchema = { ...combinedSchema, ...schema.properties };
          }
          DebugLogger.debugDataSource(`✅ Merged schema from data source ${dataSourceId}: ${Object.keys(schema.properties || {}).length} properties`);
        } catch (error: any) {
          DebugLogger.debugDataSource(`❌ Failed to get schema from data source ${dataSourceId}: ${error.message}`);
        }
      }

      DebugLogger.debugDataSource(`✅ Combined schema complete: ${Object.keys(combinedSchema).length} total properties`);
      return combinedSchema;

    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Failed to get combined schema for database ${databaseId}: ${error.message}`);
      return {};
    }
  }

  /**
   * Retrieve data source schema including properties
   */
  async getDataSourceSchema(dataSourceId: string): Promise<any> {
    try {
      DebugLogger.debugDataSource(`🔍 Retrieving data source schema: ${dataSourceId}`);

      const schema = await (this.notion as any).dataSources.retrieve({
        data_source_id: dataSourceId
      });

      DebugLogger.debugDataSource(`✅ Data source schema retrieved successfully`);
      DebugLogger.debugDataSource(`📋 Schema properties count:`, Object.keys(schema.properties || {}).length);

      return schema;
    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Failed to retrieve data source schema for ${dataSourceId}:`, error.message);
      throw error;
    }
  }

  /**
   * Query a specific data source using the proper SDK method
   */
  private async queryDataSource(
    dataSourceId: string,
    filter?: any,
    sorts?: any[]
  ): Promise<any[]> {
    try {
      DebugLogger.debugDataSource(`🚀 Querying data source using SDK method: ${dataSourceId}`);

      const results: any[] = [];
      let hasMore = true;
      let nextCursor: string | undefined;
      let pageCount = 0;

      while (hasMore) {
        DebugLogger.debugDataSource(`📤 Making SDK call: notion.dataSources.query()`);
        DebugLogger.debugDataSource(`📤 Request params:`, {
          data_source_id: dataSourceId,
          filter,
          sorts,
          page_size: 100,
          start_cursor: nextCursor
        });

        const response = await (this.notion as any).dataSources.query({
          data_source_id: dataSourceId,
          filter,
          sorts,
          page_size: 100,
          start_cursor: nextCursor
        });

        DebugLogger.debugDataSource(`📥 SDK response received, page ${pageCount + 1}`);
        const pageResults = response.results || [];
        DebugLogger.debugDataSource(`📋 Page ${pageCount + 1} results count:`, pageResults.length);

        results.push(...pageResults);
        hasMore = response.has_more || false;
        nextCursor = response.next_cursor || undefined;
        pageCount++;

        DebugLogger.debugDataSource(`📊 Total results so far: ${results.length}, hasMore: ${hasMore}`);
      }

      DebugLogger.debugDataSource(`✅ Data source SDK query completed. Total results: ${results.length}`);
      return results;

    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Data source SDK query failed for ${dataSourceId}:`, error.message);
      DebugLogger.debugDataSource(`❌ Error code:`, error.code);
      DebugLogger.debugDataSource(`❌ Error status:`, error.status);
      throw error;
    }
  }

  /**
   * Search API fallback method for API version 2025-09-03
   * Uses search to find pages belonging to a specific database
   */
  private async queryDatabaseUsingSearch(
    databaseId: string,
    startTime?: number
  ): Promise<any[]> {
    try {
      DebugLogger.debugDataSource(`🔍 Using Search API fallback for database: ${databaseId}`);

      const results: any[] = [];
      let hasMore = true;
      let nextCursor: string | undefined;
      let pageCount = 0;

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
        pageCount++;

        DebugLogger.debugDataSource(`📥 Search API page ${pageCount}: ${pagesFromDatabase.length} results from database`);

        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      const duration = startTime ? Date.now() - startTime : 0;
      DebugLogger.debugDataSource(`✅ Search API query completed successfully in ${duration}ms. Total results: ${results.length}`);
      return results;

    } catch (error: any) {
      DebugLogger.debugDataSource(`❌ Search API fallback failed: ${error.code} - ${error.message}`);
      throw error;
    }
  }


  /**
   * Extract database name from database object
   */
  private extractDatabaseName(database: any): string {
    if (database.title && database.title.length > 0) {
      return database.title[0].plain_text || "Untitled Database";
    }
    return "Untitled Database";
  }





  /**
   * Validate data source ID format
   */
  private validateDataSourceId(dataSourceId: string): boolean {
    // Data source IDs from Notion can have various formats
    // Accept any non-empty string that looks like a UUID-ish format
    const isValidLength = Boolean(dataSourceId && dataSourceId.length > 30); // Basic length check
    const hasUuidStructure = /^[0-9a-f-]+$/i.test(dataSourceId); // Contains only hex chars and dashes
    const isValid = isValidLength && hasUuidStructure;

    DebugLogger.debugDataSource(`🔍 Validating data source ID: ${dataSourceId}`);
    DebugLogger.debugDataSource(`✅ ID format valid: ${isValid} (length: ${dataSourceId?.length}, hasUuidStructure: ${hasUuidStructure})`);

    return isValid;
  }


  /**
   * Clear cache
   */
  clearCache(): void {
    this.dataSourceCache.clear();
    this.dataSourceIdCache.clear();
  }
}
