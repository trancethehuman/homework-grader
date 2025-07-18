import { Client } from "@notionhq/client";
import { config } from "dotenv";

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

  constructor(apiKey?: string) {
    const key = apiKey || process.env.NOTION_API_KEY;
    if (!key) {
      throw new Error("Notion API key is required. Set NOTION_API_KEY environment variable or provide it directly.");
    }
    
    this.notion = new Client({
      auth: key,
    });
  }

  /**
   * Fetch all pages accessible to the integration
   */
  async getAllPages(): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.search({
        filter: {
          property: "object",
          value: "page"
        },
        start_cursor: nextCursor,
        page_size: 100
      });

      for (const page of response.results) {
        if (page.object === "page" && "properties" in page) {
          const title = this.extractTitle(page);
          pages.push({
            id: page.id,
            title,
            url: page.url,
            lastEditedTime: page.last_edited_time,
            parent: page.parent
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
    const databases: NotionDatabase[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.search({
        filter: {
          property: "object",
          value: "database"
        },
        start_cursor: nextCursor,
        page_size: 100
      });

      for (const database of response.results) {
        if (database.object === "database" && "properties" in database && "url" in database && "last_edited_time" in database) {
          const title = this.extractTitle(database);
          databases.push({
            id: database.id,
            title,
            url: database.url,
            lastEditedTime: database.last_edited_time,
            properties: database.properties
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
    try {
      // First try to get it as a page
      const page = await this.notion.pages.retrieve({ page_id: pageId });
      const blocks = await this.getPageBlocks(pageId);
      
      return {
        page,
        blocks,
        type: "page"
      };
    } catch (error: any) {
      // If it fails and mentions it's a database, try to get database metadata
      if (error.code === 'validation_error' && error.message.includes('database')) {
        const database = await this.notion.databases.retrieve({ database_id: pageId });
        const entries = await this.queryDatabase(pageId);
        
        return {
          database,
          entries,
          type: "database"
        };
      }
      throw error;
    }
  }

  /**
   * Fetch database content directly
   */
  async getDatabaseContent(databaseId: string): Promise<any> {
    const database = await this.notion.databases.retrieve({ database_id: databaseId });
    const entries = await this.queryDatabase(databaseId);
    
    return {
      database,
      entries,
      type: "database"
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
      type: "page"
    };
  }

  /**
   * Fetch database metadata
   */
  async getDatabaseMetadata(databaseId: string): Promise<any> {
    const database = await this.notion.databases.retrieve({ database_id: databaseId });
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
        page_size: 100
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
  async queryDatabase(databaseId: string, filter?: any, sorts?: any[]): Promise<any[]> {
    const results: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      const response = await this.notion.databases.query({
        database_id: databaseId,
        start_cursor: nextCursor,
        page_size: 100,
        filter,
        sorts
      });

      results.push(...response.results);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return results;
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