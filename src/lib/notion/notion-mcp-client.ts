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
      console.log("=== CONNECTION ERROR (OAuth Analysis) ===");
      console.log("Error object:", JSON.stringify(error, null, 2));
      console.log("=== END CONNECTION ERROR ===");
      
      // Check if this is a 401 OAuth error at connection level
      if (error instanceof Error && error.message.includes('HTTP 401')) {
        console.log("🔒 OAuth authentication required at connection level!");
        console.log("This is the expected OAuth flow - the server is requesting authentication.");
        
        // Throw a specific OAuth error that the UI can handle
        const oauthError = new Error("OAuth authentication required");
        (oauthError as any).isOAuthRequired = true;
        throw oauthError;
      }
      
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

  async discoverTools(): Promise<any[]> {
    try {
      await this.connect();

      console.log("Discovering available tools...");
      
      const tools = await this.client.listTools();
      console.log("=== NOTION MCP TOOLS DISCOVERY ===");
      console.log("Available tools:", JSON.stringify(tools, null, 2));
      console.log("=== END TOOLS DISCOVERY ===");
      
      return tools.tools || [];
    } catch (error) {
      console.error("Error discovering tools:", error);
      console.log("=== TOOL DISCOVERY ERROR (OAuth Analysis) ===");
      console.log("Error object:", JSON.stringify(error, null, 2));
      console.log("=== END TOOL DISCOVERY ERROR ===");
      
      // Check if this is a 401 OAuth error (from connection or tool discovery)
      if (error instanceof Error && ((error as any).isOAuthRequired || error.message.includes('HTTP 401'))) {
        console.log("🔒 OAuth authentication required!");
        console.log("This is the expected OAuth flow - the server is requesting authentication.");
        
        // Throw a specific OAuth error that the UI can handle
        const oauthError = new Error("OAuth authentication required");
        (oauthError as any).isOAuthRequired = true;
        throw oauthError;
      }
      
      throw error;
    }
  }

  async initiateOAuth(): Promise<string> {
    // Generate OAuth URL similar to the one you saw in Cursor
    // The client_id and other parameters would come from the MCP server's response
    // For now, we'll construct a basic OAuth URL based on the pattern you showed
    
    const clientId = "1f8d872b-594c-80a4-b2f4-00370af2b13f"; // This would normally come from server
    const redirectUri = "https://mcp.notion.com/callback";
    const state = btoa(JSON.stringify({
      responseType: "code",
      clientId: clientId,
      redirectUri: redirectUri,
      scope: [],
      state: "",
      codeChallenge: this.generateCodeChallenge(),
      codeChallengeMethod: "S256"
    }));

    const authUrl = `https://www.notion.so/install-integration?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&owner=user`;
    
    console.log("=== NOTION OAUTH URL ===");
    console.log("Generated OAuth URL:", authUrl);
    console.log("=== END OAUTH URL ===");
    
    return authUrl;
  }

  private generateCodeChallenge(): string {
    // Generate a code challenge for PKCE
    const codeVerifier = btoa(Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    // In a real implementation, this would be a proper SHA256 hash
    return btoa(codeVerifier).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async fetchDatabaseFromUrl(databaseUrl: string): Promise<NotionDatabase | null> {
    await this.connect();

    try {
      console.log(`Fetching database from URL: ${databaseUrl}`);
      
      // First try to discover tools to see what's available
      const tools = await this.discoverTools();
      console.log("Available tools for database fetch:", tools.map(t => t.name));

      // Use the fetch tool to get database information
      const response = await this.client.callTool({
        name: "fetch",
        arguments: {
          url: databaseUrl
        }
      });

      console.log("=== NOTION DATABASE FETCH RESPONSE ===");
      console.log("Response:", JSON.stringify(response, null, 2));
      console.log("=== END DATABASE FETCH RESPONSE ===");

      // Handle the response based on what we receive
      if (response.content && Array.isArray(response.content)) {
        const content = response.content[0];
        if (content && content.type === 'text') {
          try {
            // Parse the text content as JSON if it's database info
            const databaseInfo = JSON.parse(content.text);
            return {
              id: databaseInfo.id || '',
              title: databaseInfo.title?.[0]?.plain_text || 'Untitled Database',
              url: databaseUrl,
              properties: databaseInfo.properties || {}
            };
          } catch {
            // If parsing fails, return basic info
            return {
              id: databaseUrl,
              title: 'Database from URL',
              url: databaseUrl,
              properties: {}
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.error("Error fetching database from URL:", error);
      console.log("=== DATABASE FETCH ERROR (for OAuth flow analysis) ===");
      console.log("Error object:", JSON.stringify(error, null, 2));
      console.log("=== END DATABASE FETCH ERROR ===");
      
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
  ): Promise<Array<{url: string, pageId: string}>> {
    const urlsWithIds: Array<{url: string, pageId: string}> = [];

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
          urlsWithIds.push({
            url,
            pageId: entry.id
          });
        }
      }
    }

    // Remove duplicates by URL while keeping the first occurrence
    const seen = new Set<string>();
    return urlsWithIds.filter(item => {
      if (seen.has(item.url)) {
        return false;
      }
      seen.add(item.url);
      return true;
    });
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
