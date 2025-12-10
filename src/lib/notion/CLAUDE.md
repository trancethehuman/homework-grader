# Notion Integration Documentation

This file contains all Notion-specific guidance for the homework grading system.

## OAuth/Proxy

- Notion auth uses a tiny Express proxy in `notion-proxy/` deployed to Render (free plan supported).
- The proxy owns the Notion client secret and handles `/auth/start`, `/callback`, `/refresh`, and `/auth/status/:state`.
- The CLI calls the proxy to start OAuth, opens a browser, and stores the returned access token locally.
- Default proxy base points to the hosted instance; override with `NOTION_PROXY_URL` for local testing.
- **Auto-reauth on Invalid Token**: When a Notion token becomes invalid/expired, the system automatically triggers OAuth flow instead of returning to the previous step, ensuring seamless re-authentication.

## API Version & SDK Compatibility

- **API Version**: Uses Notion API 2025-09-03 with multi-source database support and enhanced data discovery features.
- **SDK v5.1.0+**: Only compatible with API version 2025-09-03
- **Deprecated Methods**: `databases.query()` is deprecated in API 2025-09-03 and does not return results
- **Data Source API**: Primary method uses `dataSources.query()` with data source IDs
- **Search API Fallback**: When data sources unavailable, uses Search API to filter pages by database_id
- **No Legacy Support**: Cannot use `databases.query()` endpoint with API version 2025-09-03

## Official Documentation Links

- [Upgrade Guide 2025-09-03](https://developers.notion.com/docs/upgrade-guide-2025-09-03) - Migration details for the new API
- [Database Reference](https://developers.notion.com/reference/database) - Database object and data sources array
- [Data Source Reference](https://developers.notion.com/reference/data-source) - Data source querying and structure
- [Working with Databases](https://developers.notion.com/docs/working-with-databases)
- [Working with Page Content](https://developers.notion.com/docs/working-with-page-content)
- [Data Source Query API](https://developers.notion.com/reference/query-a-data-source) - **Critical for querying database content**
- [Page API Reference](https://developers.notion.com/reference/page)
- [API Changelog](https://developers.notion.com/page/changelog)

## Data Source Querying (2025-09-03 API)

**CRITICAL**: In the 2025-09-03 API version, the traditional `databases.query()` method is deprecated. Database content must be queried using the Data Source API.

### CRITICAL: Always Use SDK Methods, Never Raw HTTP Requests

**DO NOT** use raw HTTP requests with `notion.request()` - they cause `invalid_request_url` errors:

```typescript
// WRONG - Will fail with invalid_request_url
const response = await notion.request({
  path: `/v1/data_sources/${dataSourceId}/query`,
  method: 'post',
  body: { filter, sorts, page_size: 100 }
});
```

**ALWAYS** use the SDK's built-in methods:

```typescript
// CORRECT - Use SDK method
const response = await notion.dataSources.query({
  data_source_id: dataSourceId,
  filter,
  sorts,
  page_size: 100,
  start_cursor: nextCursor
});
```

**Why This Matters**:
- The SDK properly handles URL formation and request structure
- Raw HTTP requests fail due to endpoint path issues
- SDK methods are tested and maintained by Notion
- SDK provides type safety and better error messages

### API Endpoint

```
POST https://api.notion.com/v1/data_sources/{data_source_id}/query
```

**Note**: Access this endpoint through `notion.dataSources.query()`, not `notion.request()`.

### Authentication & Headers

```json
{
  "Authorization": "Bearer {access_token}",
  "Content-Type": "application/json",
  "Notion-Version": "2025-09-03"
}
```

### Request Structure

```json
{
  "filter": {
    "property": "Status",
    "select": { "equals": "Active" }
  },
  "sorts": [
    {
      "property": "Created",
      "direction": "descending"
    }
  ],
  "start_cursor": "optional_pagination_cursor",
  "page_size": 100,
  "filter_properties": ["prop1", "prop2"]
}
```

### Response Structure

```json
{
  "object": "list",
  "results": [
    {
      "object": "page",
      "id": "page-id",
      "properties": { ... },
      "parent": {
        "type": "data_source_id",
        "data_source_id": "data-source-id"
      }
    }
  ],
  "next_cursor": "optional_next_cursor",
  "has_more": false
}
```

### Key Implementation Requirements

1. **Data Source ID Discovery**: Each database has a `data_sources` array containing the data source IDs needed for querying

   ```typescript
   // Get database object first
   const database = await notion.databases.retrieve(databaseId);
   // Use the data source IDs from the database
   const dataSourceIds = database.data_sources.map((ds) => ds.id);
   ```

2. **Individual Data Source Queries**: Query each data source separately and combine results

   ```typescript
   for (const dataSourceId of dataSourceIds) {
     const response = await notion.request({
       path: `data_sources/${dataSourceId}/query`,
       method: "POST",
       body: {
         /* query parameters */
       },
     });
   }
   ```

3. **Filtering**: Supports complex filters similar to Notion UI
   - Property-based filters (text, number, date, select, checkbox, etc.)
   - Logical operators: `and`, `or`
   - Comparison operators: `equals`, `contains`, `starts_with`, `is_empty`, etc.

4. **Pagination**: Use `start_cursor` and `page_size` for large datasets
   - Default page size: 100 items
   - Maximum page size: 100 items
   - Use `next_cursor` from response for subsequent requests

5. **Error Handling**:
   - **404**: Data source not found or not accessible
   - **403**: Insufficient permissions (need read content capabilities)
   - **400**: Invalid request structure or parameters

### Permissions Requirements

- Integration must have **read content capabilities**
- Parent database must be **shared with the integration**
- For wiki data sources: may contain both pages and databases

### Performance Considerations

- Each data source query is a separate API call
- Implement proper rate limiting (3 requests per second)
- Cache data source IDs to avoid repeated database.retrieve() calls
- Use pagination for large datasets to avoid timeouts

### Migration from Legacy API

```typescript
// OLD (deprecated in 2025-09-03):
await notion.databases.query({ database_id: databaseId });

// NEW (required in 2025-09-03):
const database = await notion.databases.retrieve(databaseId);
const results = [];
for (const dataSource of database.data_sources) {
  const response = await notion.request({
    path: `data_sources/${dataSource.id}/query`,
    method: "POST",
    body: {
      /* filters, sorts, pagination */
    },
  });
  results.push(...response.results);
}
```

### Fallback Strategy for API 2025-09-03

When `database.data_sources` is empty or unavailable, the system uses **Search API** as a fallback instead of the deprecated `databases.query()` method:

```typescript
// Search API fallback (works with 2025-09-03)
const response = await notion.search({
  filter: {
    property: "object",
    value: "page"
  },
  page_size: 100
});

// Filter results to only include pages from the target database
const pagesFromDatabase = response.results.filter(result => {
  const parent = result.parent;
  return parent?.type === 'database_id' && parent?.database_id === databaseId;
});
```

**Important**: Never use `databases.query()` with API version 2025-09-03 as it will return no results.

## Filter Formats for Data Source Queries

### Critical Rules for Filter Formatting

1. **Single value filters**: Use simple object structure (no `or`/`and` wrapper)
2. **Multiple value filters**: Use `or` array for include logic, `and` array for exclude logic
3. **Property name**: Must match exactly as it appears in Notion (case-sensitive)
4. **Type-specific operators**: Each property type has specific valid operators

### Select Property Filters

**Single value (include):**
```json
{
  "property": "Status",
  "select": { "equals": "Active" }
}
```

**Multiple values (include - OR logic):**
```json
{
  "or": [
    { "property": "Status", "select": { "equals": "Active" } },
    { "property": "Status", "select": { "equals": "In Progress" } }
  ]
}
```

**Single value (exclude):**
```json
{
  "property": "Status",
  "select": { "does_not_equal": "Archived" }
}
```

**Multiple values (exclude - AND logic):**
```json
{
  "and": [
    { "property": "Status", "select": { "does_not_equal": "Archived" } },
    { "property": "Status", "select": { "does_not_equal": "Deleted" } }
  ]
}
```

**Available operators for select:**
- `equals` - Exact match
- `does_not_equal` - Not equal to
- `is_empty` - Has no value
- `is_not_empty` - Has any value

### Multi-Select Property Filters

**Single value (contains):**
```json
{
  "property": "Tags",
  "multi_select": { "contains": "TypeScript" }
}
```

**Multiple values (contains any - OR logic):**
```json
{
  "or": [
    { "property": "Tags", "multi_select": { "contains": "TypeScript" } },
    { "property": "Tags", "multi_select": { "contains": "JavaScript" } }
  ]
}
```

**Does not contain:**
```json
{
  "property": "Tags",
  "multi_select": { "does_not_contain": "Deprecated" }
}
```

**Available operators for multi_select:**
- `contains` - Contains this value
- `does_not_contain` - Does not contain this value
- `is_empty` - Has no values
- `is_not_empty` - Has at least one value

### Number Property Filters

```json
{
  "property": "Week Number",
  "number": { "equals": 3 }
}
```

**Available operators for number:**
- `equals`
- `does_not_equal`
- `greater_than`
- `greater_than_or_equal_to`
- `less_than`
- `less_than_or_equal_to`
- `is_empty`
- `is_not_empty`

### Rich Text Property Filters

```json
{
  "property": "Description",
  "rich_text": { "contains": "important" }
}
```

**Available operators for rich_text:**
- `equals` - Exact match
- `does_not_equal` - Not equal to
- `contains` - Contains substring
- `does_not_contain` - Does not contain substring
- `starts_with` - Starts with string
- `ends_with` - Ends with string
- `is_empty` - Has no text
- `is_not_empty` - Has text

### Checkbox Property Filters

```json
{
  "property": "Completed",
  "checkbox": { "equals": true }
}
```

**Available operators for checkbox:**
- `equals` - true or false
- `does_not_equal` - opposite of value

### Compound Filters

**Complex example with AND and OR:**
```json
{
  "and": [
    {
      "property": "Status",
      "select": { "equals": "Active" }
    },
    {
      "or": [
        { "property": "Priority", "select": { "equals": "High" } },
        { "property": "Priority", "select": { "equals": "Critical" } }
      ]
    }
  ]
}
```

**Nesting rules:**
- Compound filters (`and`, `or`) can be nested up to **2 levels deep**
- Each level can contain property filters or other compound filters

### Common Pitfalls and Solutions

**Wrong: Wrapping single value in `or` array**
```json
{
  "or": [
    { "property": "Status", "select": { "equals": "Active" } }
  ]
}
```

**Right: Simple object for single value**
```json
{
  "property": "Status",
  "select": { "equals": "Active" }
}
```

**Wrong: Using non-existent operators**
```json
{
  "property": "Week Number",
  "number": { "not_equals": 5 }  // Wrong: should be does_not_equal
}
```

**Right: Correct operator name**
```json
{
  "property": "Week Number",
  "number": { "does_not_equal": 5 }
}
```

**Wrong: Using `equals` for multi-select**
```json
{
  "property": "Tags",
  "multi_select": { "equals": "TypeScript" }  // Wrong: multi-select doesn't have equals
}
```

**Right: Use `contains` for multi-select**
```json
{
  "property": "Tags",
  "multi_select": { "contains": "TypeScript" }
}
```

## Notion in the CLI

- Selecting "Notion Database" shows a brief screen, detects existing access, and provides a shortcut to clear.
- We refresh tokens when possible and prompt for OAuth only when needed.
- **Automatic Re-authentication**: If a Notion token is invalid or expired when accessing databases, the system automatically clears the invalid token and triggers the OAuth flow, eliminating the need for users to manually navigate back and re-authenticate.

## Data Conflict Protection

### ConflictDetector Class (`src/lib/notion/conflict-detector.ts`)

- **NEW**: Intelligent detection of existing grading data before updates
- **Cell-Level Conflict Checking**: Checks if grading columns already contain data
- **Batch Conflict Processing**: Efficiently processes multiple repository updates
- **Field-Level Granularity**: Identifies specific fields with existing data
- **Property Value Extraction**: Handles all Notion property types (rich_text, select, etc.)
- **Override Decision Support**: Applies user choices for keep/replace/skip actions

### OverrideConfirmation Component (`src/components/notion/override-confirmation.tsx`)

- **NEW**: Interactive UI for resolving data conflicts
- **Bulk Action Options**: Replace all, keep all, field-by-field review, or cancel
- **Detailed Conflict View**: Shows existing vs new values for each field
- **Repository-by-Repository Flow**: Guides users through each conflict systematically
- **Progress Tracking**: Displays conflict resolution progress
- **User-Friendly Interface**: Clear navigation with arrow keys and enter selection

### Enhanced GradingDatabaseService (`src/lib/notion/grading-database-service.ts`)

- **NEW**: Conflict-aware Notion database operations
- **Pre-Save Conflict Detection**: Checks for existing data before updates
- **Conditional Override Processing**: Applies user decisions for partial updates
- **Legacy Support**: Maintains backward compatibility with existing save methods
- **Error Resilience**: Comprehensive error handling during conflict resolution

## Database Filtering Workflow

The system implements server-side filtering for Notion databases with a user-friendly confirmation flow:

1. **Filter Selection**: User selects property and filter criteria before data fetch
2. **Server-Side Filtering**: Filter is converted to Notion API format and applied in data source query
3. **Confirmation Screen**: Shows row count, database name, filter details before proceeding
4. **User Options**: Continue to grading or go back to adjust filter
5. **Grading**: Only filtered rows are processed

This ensures:
- Efficient API usage (only filtered data is fetched)
- Accurate row counts shown to user
- Only intended rows are graded
- Clear user feedback before processing

## Notion API Development Rules

**ALWAYS fetch and read the official Notion API documentation before writing or making any changes regarding Notion integration**. This is critical because:

- The Notion API is actively evolving (especially the 2025-09-03 version)
- Implementation details change between API versions
- Official documentation provides the most accurate and up-to-date information
- **Key Migration Knowledge**: In 2025-09-03 API, `/v1/databases/{id}/query` is deprecated - use data source queries or search API instead
- Always reference these key documentation sources:
  - [Upgrade Guide 2025-09-03](https://developers.notion.com/docs/upgrade-guide-2025-09-03)
  - [Database Reference](https://developers.notion.com/reference/database)
  - [Data Source Reference](https://developers.notion.com/reference/data-source)
  - [Filter Data Source Entries](https://developers.notion.com/reference/post-data-source-query-filter)
  - [Changelog](https://developers.notion.com/page/changelog)
