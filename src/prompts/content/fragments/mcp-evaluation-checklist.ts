export const MCP_EVALUATION_CHECKLIST = `**MCP Implementation Checklist (Evaluate silently, mention critical issues in feedback):**

 Required Patterns:

1. Client Abstraction Layer
   - Dedicated MCP client classes in /lib/mcp/client/ (or similar structure)
   - Class-based approach with isConnected flag for state management
   - Singleton pattern with factory function (e.g., getFirecrawlMCPClient()) for connection reuse
   - Reset function for cleanup (e.g., resetFirecrawlMCPClient())

2. Connection Management
   - connect() method checks existing connection before reconnecting
   - disconnect() method with error handling
   - getTools() method auto-connects if not connected
   - Lazy connection initialization
   - **CRITICAL**: Never disconnect during streamText() - tools may be called during stream

3. Transport Configuration
   - SSE transport: new SSEClientTransport(new URL(serverUrl))
   - URL format: https://mcp.{service}.dev/{apiKey}/v2/sse
   - Import from @modelcontextprotocol/sdk/client/sse.js
   - Environment variable-based configuration with defaults

4. MCP Client Initialization (AI SDK 5)
   - Uses experimental_createMCPClient from "ai"
   - Transport properly passed to client creation
   - Awaits async initialization

5. Tool Retrieval
   - await client.tools() to retrieve MCP tools
   - Return type: Record<string, any> for AI SDK compatibility
   - Auto-connect before retrieving if not connected
   - Try-catch with descriptive error messages

6. Tool Integration in Routes
   - Order: connect → getTools() → pass to streamText()
   - Tools passed directly or wrapped for logging
   - Client not disconnected before streaming completes

7. Error Handling & Logging
   - Try-catch blocks in all MCP async methods
   - Descriptive error messages with MCP server context
   - Optional: Emoji-prefixed logs for visibility (   💥)

8. Type Safety
   - Proper client type: Awaited<ReturnType<typeof experimental_createMCPClient>> | null
   - Record<string, any> for tool returns (AI SDK compatibility)
   - Dedicated types file for MCP-specific interfaces

9. Environment Configuration
   - MCP credentials from process.env with validation
   - Clear error messages if env vars missing
   - Constructor accepts optional overrides

🚨 Critical Issues to Flag:
-  Disconnecting before stream finishes → "closed client" errors
-  Creating new client per request → performance issues
-  Wrong SSE URL format → connection failures
-  Strict typing on tools → TypeScript errors
-  No client abstraction → scattered MCP logic across routes
-  Missing singleton pattern → repeated handshakes
-  Hardcoded credentials → security risk`;
