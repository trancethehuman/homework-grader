import { NotionService } from "./notion-service.js";
import { NotionSchemaMapper } from "./schema-mapper.js";

export interface FieldConflict {
  fieldName: string;
  displayName: string;
  existingValue: string;
  newValue: string;
  hasConflict: boolean;
}

export interface ConflictDetectionResult {
  pageId: string;
  repositoryName: string;
  hasConflicts: boolean;
  conflicts: FieldConflict[];
}

export interface OverrideDecision {
  fieldName: string;
  action: 'keep' | 'replace' | 'skip';
}

export class ConflictDetector {
  private notionService: NotionService;

  constructor(accessToken?: string) {
    this.notionService = new NotionService(accessToken);
  }

  /**
   * Check for existing data conflicts before updating a Notion page
   */
  async checkForConflicts(
    pageId: string,
    newProperties: Record<string, any>,
    repositoryName: string
  ): Promise<ConflictDetectionResult> {
    try {
      // Get current page properties using the NotionService public method
      const page = await this.getPageProperties(pageId);
      const existingProperties = page.properties;
      const conflicts: FieldConflict[] = [];

      // Get grading field mappings
      const gradingFields = this.getGradingFieldMappings();

      // Check each grading field for conflicts
      for (const [fieldName, displayName] of Object.entries(gradingFields)) {
        const existingProperty = existingProperties[fieldName];
        const newProperty = newProperties[fieldName];

        if (existingProperty && newProperty) {
          const existingValue = this.extractPropertyValue(existingProperty);
          const newValue = this.extractPropertyValue(newProperty);

          // Check if existing value exists and would be overwritten
          const hasConflict = existingValue.trim().length > 0 &&
                             newValue.trim().length > 0 &&
                             existingValue !== newValue;

          conflicts.push({
            fieldName,
            displayName,
            existingValue: existingValue.substring(0, 100) + (existingValue.length > 100 ? '...' : ''),
            newValue: newValue.substring(0, 100) + (newValue.length > 100 ? '...' : ''),
            hasConflict
          });
        }
      }

      const hasConflicts = conflicts.some(c => c.hasConflict);

      return {
        pageId,
        repositoryName,
        hasConflicts,
        conflicts: conflicts.filter(c => c.hasConflict) // Only return actual conflicts
      };
    } catch (error: any) {
      throw new Error(`Failed to check conflicts for ${repositoryName}: ${error.message}`);
    }
  }

  /**
   * Check conflicts for multiple repositories
   */
  async checkBatchConflicts(
    updates: Array<{ pageId: string; properties: Record<string, any>; repositoryName: string }>
  ): Promise<ConflictDetectionResult[]> {
    const results: ConflictDetectionResult[] = [];

    for (const update of updates) {
      if (update.pageId) {
        try {
          const result = await this.checkForConflicts(
            update.pageId,
            update.properties,
            update.repositoryName
          );
          results.push(result);
        } catch (error: any) {
          // Add error result for failed checks
          results.push({
            pageId: update.pageId,
            repositoryName: update.repositoryName,
            hasConflicts: false,
            conflicts: []
          });
        }
      }
    }

    return results;
  }

  /**
   * Apply user override decisions to filter properties for update
   */
  applyOverrideDecisions(
    originalProperties: Record<string, any>,
    decisions: OverrideDecision[]
  ): Record<string, any> {
    const filteredProperties: Record<string, any> = {};

    // Create decision map for quick lookup
    const decisionMap = new Map(decisions.map(d => [d.fieldName, d.action]));

    for (const [fieldName, value] of Object.entries(originalProperties)) {
      const decision = decisionMap.get(fieldName);

      // Include property if:
      // 1. No decision specified (not a grading field)
      // 2. Decision is 'replace'
      // 3. Decision is not 'skip' or 'keep'
      if (!decision || decision === 'replace') {
        filteredProperties[fieldName] = value;
      }
      // Skip properties where decision is 'keep' or 'skip'
    }

    return filteredProperties;
  }

  /**
   * Get page properties using NotionService
   */
  private async getPageProperties(pageId: string): Promise<any> {
    // We need to access the Notion client through NotionService
    // Since notion property is private, we'll use a workaround by calling a page retrieval method
    // that exists in NotionService or create a public method to get page properties

    // For now, let's use the existing public method that should work
    const pageContent = await this.notionService.getPageContentDirect(pageId);
    return pageContent.page;
  }

  /**
   * Get mapping of grading field names to display names
   */
  private getGradingFieldMappings(): Record<string, string> {
    return {
      'Developer Feedback': 'Developer Feedback',
      'Repo Explained': 'Repository Explanation',
      'Grade': 'Grade',
      'Processing Status': 'Processing Status',
      'Processing Error': 'Processing Error',
      'Browser Test Results': 'Browser Test Results',
      'Browser Test Status': 'Browser Test Status',
      'Browser Test Screenshots': 'Browser Test Screenshots',
      'Browser Test Actions': 'Browser Test Actions',
      'Browser Test Duration': 'Browser Test Duration',
      'Browser Test Errors': 'Browser Test Errors'
    };
  }

  /**
   * Extract readable value from Notion property
   */
  private extractPropertyValue(property: any): string {
    if (!property) return '';

    switch (property.type) {
      case 'rich_text':
        return property.rich_text?.map((text: any) => text.plain_text).join('') || '';

      case 'title':
        return property.title?.map((text: any) => text.plain_text).join('') || '';

      case 'select':
        return property.select?.name || '';

      case 'multi_select':
        return property.multi_select?.map((option: any) => option.name).join(', ') || '';

      case 'number':
        return property.number?.toString() || '';

      case 'checkbox':
        return property.checkbox ? 'Yes' : 'No';

      case 'date':
        return property.date?.start || '';

      case 'url':
        return property.url || '';

      case 'email':
        return property.email || '';

      case 'phone_number':
        return property.phone_number || '';

      case 'files':
        return property.files?.map((file: any) => file.name).join(', ') || '';

      default:
        return '';
    }
  }
}