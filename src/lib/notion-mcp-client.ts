import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface NotionDatabase {
  id: string;
  title: string;
  url: string;
  properties: Record<string, any>;
}

export interface NotionDatabaseEntry {
  id: string;
  properties: Record<string, any>;
  url?: string;
}

export class NotionMCPClient {
  private client: Client;
  private isConnected = false;
  private transport: StreamableHTTPClientTransport;

  constructor() {
    this.client = new Client(
      {
        name: "homework-grader",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.notion.com/mcp")
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      console.log("Connecting to Notion MCP server...");
      await this.client.connect(this.transport);
      this.isConnected = true;
      console.log("Successfully connected to Notion MCP server");
    } catch (error) {
      console.error("Failed to connect to Notion MCP server:", error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.close();
      this.isConnected = false;
      console.log("Disconnected from Notion MCP server");
    } catch (error) {
      console.error("Error disconnecting from Notion MCP server:", error);
    }
  }

  async listDatabases(): Promise<NotionDatabase[]> {
    await this.connect();

    try {
      console.log("Calling list_databases tool...");

      // This is the first tool call that should trigger OAuth
      const response = await this.client.callTool({
        name: "list_databases",
        arguments: {},
      });

      console.log("=== NOTION MCP RESPONSE (for OAuth flow analysis) ===");
      console.log("Response:", JSON.stringify(response, null, 2));
      console.log("=== END NOTION MCP RESPONSE ===");

      // Handle the response based on what we receive
      if (response.content && Array.isArray(response.content)) {
        return response.content.map((item: any) => ({
          id: item.id,
          title: item.title || "Untitled Database",
          url: item.url || "",
          properties: item.properties || {},
        }));
      }

      return [];
    } catch (error) {
      console.error("Error listing databases:", error);
      console.log("=== ERROR DETAILS (for OAuth flow analysis) ===");
      console.log("Error object:", JSON.stringify(error, null, 2));
      console.log("=== END ERROR DETAILS ===");

      // Re-throw to handle in the calling code
      throw error;
    }
  }

  async queryDatabase(databaseId: string): Promise<NotionDatabaseEntry[]> {
    await this.connect();

    try {
      console.log(`Querying database: ${databaseId}`);

      const response = await this.client.callTool({
        name: "query_database",
        arguments: {
          database_id: databaseId,
        },
      });

      console.log(
        "Database query response:",
        JSON.stringify(response, null, 2)
      );

      if (response.content && Array.isArray(response.content)) {
        return response.content.map((item: any) => ({
          id: item.id,
          properties: item.properties || {},
          url: item.url || "",
        }));
      }

      return [];
    } catch (error) {
      console.error("Error querying database:", error);
      throw error;
    }
  }

  async extractGitHubUrls(
    entries: NotionDatabaseEntry[],
    propertyName: string
  ): Promise<string[]> {
    const urls: string[] = [];

    for (const entry of entries) {
      const property = entry.properties[propertyName];

      if (property) {
        let url: string | undefined;

        // Handle different property types
        if (property.type === "url" && property.url) {
          url = property.url;
        } else if (
          property.type === "rich_text" &&
          property.rich_text?.[0]?.plain_text
        ) {
          url = property.rich_text[0].plain_text;
        } else if (
          property.type === "title" &&
          property.title?.[0]?.plain_text
        ) {
          url = property.title[0].plain_text;
        }

        // Check if it's a GitHub URL
        if (url && (url.includes("github.com") || url.includes("github.io"))) {
          urls.push(url);
        }
      }
    }

    return urls.filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
  }

  async getAvailableTools(): Promise<any[]> {
    await this.connect();

    try {
      const tools = await this.client.listTools();
      console.log(
        "Available Notion MCP tools:",
        JSON.stringify(tools, null, 2)
      );
      return tools.tools || [];
    } catch (error) {
      console.error("Error getting available tools:", error);
      throw error;
    }
  }
}
