import { Client } from "@notionhq/client";
import { config } from "dotenv";
import { NotionTokenStorage } from "./notion-token-storage.js";

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

export class NotionService {
  private notion: Client;
  private storage: NotionTokenStorage;

  constructor(accessToken?: string) {
    this.storage = new NotionTokenStorage();
    let token = accessToken;
    if (!token) {
      const saved = this.storage.getToken();
      token = saved?.access_token;
    }
    if (!token) {
      throw new Error(
        "Notion access token is missing. Please authenticate via Notion OAuth in the CLI."
      );
    }
    this.notion = new Client({ auth: token });
  }

  /**
   * Validate the current token by making a lightweight API call
   */
  async validateToken(): Promise<{ valid: boolean; error?: string }> {
    try {
      // Make a simple API call to test token validity
      await this.notion.users.me({});
      return { valid: true };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.log("❌ Token validation failed:", errorMessage);

      if (errorMessage.includes("API token is invalid") ||
          errorMessage.includes("unauthorized") ||
          error.code === "unauthorized") {
        // Clear invalid token from storage
        console.log("🧹 Clearing invalid token from storage");
        this.storage.clearToken();
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
          value: "database",
        },
        start_cursor: nextCursor,
        page_size: 100,
      });

      for (const database of response.results) {
        if (
          database.object === "database" &&
          "properties" in database &&
          "url" in database &&
          "last_edited_time" in database
        ) {
          const title = this.extractTitle(database);
          databases.push({
            id: database.id,
            title,
            url: database.url,
            lastEditedTime: database.last_edited_time,
            properties: database.properties,
          });
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
        const database = await this.notion.databases.retrieve({
          database_id: pageId,
        });
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
    const database = await this.notion.databases.retrieve({
      database_id: databaseId,
    });
    const entries = await this.queryDatabase(databaseId);

    return {
      database,
      entries,
      type: "database",
    };
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
   */
  async getDatabaseMetadata(databaseId: string): Promise<any> {
    const database = await this.notion.databases.retrieve({
      database_id: databaseId,
    });
    return database;
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
   */
  async queryDatabase(
    databaseId: string,
    filter?: any,
    sorts?: any[]
  ): Promise<any[]> {
    const results: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.databases.query({
        database_id: databaseId,
        start_cursor: nextCursor,
        page_size: 100,
        filter,
        sorts,
      });

      results.push(...response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return results;
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

    const response = await this.notion.databases.create({
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
    const response = await this.notion.databases.update({
      database_id: databaseId,
      properties,
    });

    return response;
  }

  /**
   * Create a new entry in a database
   */
  async createDatabaseEntry(
    databaseId: string,
    properties: Record<string, any>
  ): Promise<any> {
    const response = await this.notion.pages.create({
      parent: {
        type: "database_id",
        database_id: databaseId,
      },
      properties,
    });

    return response;
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
   */
  async getDatabaseProperties(
    databaseId: string
  ): Promise<Record<string, any>> {
    const database = await this.notion.databases.retrieve({
      database_id: databaseId,
    });

    return database.properties;
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
}
