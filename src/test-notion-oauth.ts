#!/usr/bin/env node

import { NotionMCPClient } from './lib/notion-mcp-client.js';

async function testNotionOAuth() {
  console.log('=== Testing Notion MCP OAuth Flow ===');
  
  const client = new NotionMCPClient();
  
  try {
    console.log('1. Attempting to connect to Notion MCP server...');
    await client.connect();
    
    console.log('2. Attempting to list available tools...');
    const tools = await client.getAvailableTools();
    console.log('Available tools:', tools.map(t => t.name).join(', '));
    
    console.log('3. Attempting to list databases (this should trigger OAuth)...');
    const databases = await client.listDatabases();
    console.log(`Found ${databases.length} databases`);
    
    if (databases.length > 0) {
      console.log('First database:', databases[0]);
      
      console.log('4. Attempting to query the first database...');
      const entries = await client.queryDatabase(databases[0].id);
      console.log(`Found ${entries.length} entries in database`);
      
      if (entries.length > 0) {
        console.log('First entry properties:', Object.keys(entries[0].properties));
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.disconnect();
  }
}

// Run the test
testNotionOAuth().catch(console.error);