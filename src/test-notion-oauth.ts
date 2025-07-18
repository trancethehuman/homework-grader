#!/usr/bin/env node

import { NotionMCPClient } from './lib/notion/notion-mcp-client.js';

async function testNotionOAuth() {
  console.log('=== Testing Notion MCP OAuth Flow ===');
  
  const client = new NotionMCPClient();
  
  try {
    console.log('1. Attempting to connect to Notion MCP server...');
    await client.connect();
    
    console.log('2. Attempting to list available tools...');
    const tools = await client.getAvailableTools();
    console.log('Available tools:', tools.map((t: any) => t.name).join(', '));
    
    console.log('3. Testing database fetch from URL (this should trigger OAuth)...');
    
    // Test with a sample URL - user should replace with actual database URL
    const testUrl = 'https://www.notion.so/your-workspace/your-database-123';
    console.log('Testing with URL:', testUrl);
    
    try {
      const database = await client.fetchDatabaseFromUrl(testUrl);
      if (database) {
        console.log('Database fetched successfully:', database);
        
        console.log('4. Attempting to query the database...');
        const entries = await client.queryDatabase(database.id);
        console.log(`Found ${entries.length} entries in database`);
        
        if (entries.length > 0) {
          console.log('First entry properties:', Object.keys(entries[0].properties));
        }
      } else {
        console.log('No database returned from URL');
      }
    } catch (urlError) {
      console.log('URL fetch failed (expected for test URL):', urlError instanceof Error ? urlError.message : urlError);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.disconnect();
  }
}

// Run the test
testNotionOAuth().catch(console.error);