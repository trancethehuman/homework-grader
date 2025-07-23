export interface NotionProperty {
  type: string;
  [key: string]: any;
}

export interface GradingSchemaField {
  name: string;
  type: 'string' | 'boolean';
  description?: string;
}

export class NotionSchemaMapper {
  /**
   * Generate Notion database properties from grading schema
   */
  static generateGradingDatabaseProperties(
    includeTitle: boolean = true, 
    options: { skipGithubUrlColumn?: boolean } = {}
  ): Record<string, NotionProperty> {
    const properties: Record<string, NotionProperty> = {};
    
    // Repository identification (Title column) - only add if requested
    if (includeTitle) {
      properties.repository_name = {
        type: "title",
        title: {},
      };
    }
      
    // Repository metadata - only add if not skipped
    if (!options.skipGithubUrlColumn) {
      properties.github_url = {
        type: "url",
        url: {},
      };
    }
      
    properties.graded_at = {
      type: "date",
      date: {},
    };

    // Flattened grading schema properties
    properties.project_purpose_summary = {
      type: "rich_text",
      rich_text: {},
    };
      
    properties.project_purpose_source = {
      type: "rich_text", 
      rich_text: {},
    };
    
    properties.execution_environment_platform = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.execution_environment_instructions = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.logic_tracing_traceable = {
      type: "checkbox",
      checkbox: {},
    };
    
    properties.logic_tracing_explanation = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.confusing_parts_found = {
      type: "checkbox", 
      checkbox: {},
    };
    
    properties.confusing_parts_details = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.fulfillment_accomplished = {
      type: "checkbox",
      checkbox: {},
    };
    
    properties.fulfillment_explanation = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.complexity_and_features_complex = {
      type: "checkbox",
      checkbox: {},
    };
    
    properties.complexity_and_features_features_summary = {
      type: "rich_text",
      rich_text: {},
    };
    
    properties.structure_systematic = {
      type: "checkbox",
      checkbox: {},
    };
    
    properties.structure_explanation = {
      type: "rich_text",
      rich_text: {},
    };

    return properties;
  }

  /**
   * Transform grading data to Notion database entry format
   */
  static transformGradingDataToNotionProperties(
    gradingData: any,
    repositoryName: string,
    githubUrl: string,
    titlePropertyName?: string,
    githubUrlColumnName?: string,
    isUpdate: boolean = false
  ): Record<string, any> {
    const properties: Record<string, any> = {};
    
    // Set the title property only for new entries (don't overwrite for updates)
    if (!isUpdate) {
      const titleProp = titlePropertyName || "repository_name";
      properties[titleProp] = {
        title: [
          {
            text: {
              content: repositoryName,
            },
          },
        ],
      };
    }
    
    // Use the existing GitHub URL column name or default to github_url
    const githubUrlProp = githubUrlColumnName || "github_url";
    // Only set GitHub URL for new entries (existing rows already have it)
    if (!isUpdate) {
      properties[githubUrlProp] = {
        url: githubUrl,
      };
    }
    
    properties.graded_at = {
      date: {
        start: new Date().toISOString(),
      },
    };

    // Flatten and map grading data
    if (gradingData.project_purpose) {
      properties.project_purpose_summary = {
        rich_text: [
          {
            text: {
              content: gradingData.project_purpose.summary || "",
            },
          },
        ],
      };
      
      properties.project_purpose_source = {
        rich_text: [
          {
            text: {
              content: gradingData.project_purpose.source || "",
            },
          },
        ],
      };
    }

    if (gradingData.execution_environment) {
      properties.execution_environment_platform = {
        rich_text: [
          {
            text: {
              content: gradingData.execution_environment.platform || "",
            },
          },
        ],
      };
      
      properties.execution_environment_instructions = {
        rich_text: [
          {
            text: {
              content: gradingData.execution_environment.instructions || "",
            },
          },
        ],
      };
    }

    if (gradingData.logic_tracing) {
      properties.logic_tracing_traceable = {
        checkbox: gradingData.logic_tracing.traceable || false,
      };
      
      properties.logic_tracing_explanation = {
        rich_text: [
          {
            text: {
              content: gradingData.logic_tracing.explanation || "",
            },
          },
        ],
      };
    }

    if (gradingData.confusing_parts) {
      properties.confusing_parts_found = {
        checkbox: gradingData.confusing_parts.found || false,
      };
      
      properties.confusing_parts_details = {
        rich_text: [
          {
            text: {
              content: gradingData.confusing_parts.details || "",
            },
          },
        ],
      };
    }

    if (gradingData.fulfillment) {
      properties.fulfillment_accomplished = {
        checkbox: gradingData.fulfillment.accomplished || false,
      };
      
      properties.fulfillment_explanation = {
        rich_text: [
          {
            text: {
              content: gradingData.fulfillment.explanation || "",
            },
          },
        ],
      };
    }

    if (gradingData.complexity_and_features) {
      properties.complexity_and_features_complex = {
        checkbox: gradingData.complexity_and_features.complex || false,
      };
      
      properties.complexity_and_features_features_summary = {
        rich_text: [
          {
            text: {
              content: gradingData.complexity_and_features.features_summary || "",
            },
          },
        ],
      };
    }

    if (gradingData.structure) {
      properties.structure_systematic = {
        checkbox: gradingData.structure.systematic || false,
      };
      
      properties.structure_explanation = {
        rich_text: [
          {
            text: {
              content: gradingData.structure.explanation || "",
            },
          },
        ],
      };
    }

    return properties;
  }

  /**
   * Get list of grading property names (for checking existing database schema)
   */
  static getGradingPropertyNames(): string[] {
    return [
      "repository_name",
      "github_url", 
      "graded_at",
      "project_purpose_summary",
      "project_purpose_source",
      "execution_environment_platform",
      "execution_environment_instructions",
      "logic_tracing_traceable",
      "logic_tracing_explanation",
      "confusing_parts_found",
      "confusing_parts_details",
      "fulfillment_accomplished",
      "fulfillment_explanation",
      "complexity_and_features_complex",
      "complexity_and_features_features_summary",
      "structure_systematic",
      "structure_explanation",
    ];
  }

  /**
   * Check if database has all required grading properties
   */
  static hasGradingProperties(databaseProperties: Record<string, any>): boolean {
    const requiredProperties = this.getGradingPropertyNames();
    const existingProperties = Object.keys(databaseProperties);
    
    return requiredProperties.every(prop => existingProperties.includes(prop));
  }

  /**
   * Get missing grading properties from database schema
   */
  static getMissingGradingProperties(
    databaseProperties: Record<string, any>, 
    options: { skipGithubUrlColumn?: boolean } = {}
  ): Record<string, NotionProperty> {
    // Check if database already has a title property
    const hasExistingTitle = Object.values(databaseProperties).some((prop: any) => prop.type === "title");
    
    // Generate required properties, excluding title if one already exists, and optionally skip github_url
    const requiredProperties = this.generateGradingDatabaseProperties(!hasExistingTitle, {
      skipGithubUrlColumn: options.skipGithubUrlColumn
    });
    const existingProperties = Object.keys(databaseProperties);
    const missingProperties: Record<string, NotionProperty> = {};
    
    for (const [propertyName, propertyConfig] of Object.entries(requiredProperties)) {
      if (!existingProperties.includes(propertyName)) {
        missingProperties[propertyName] = propertyConfig;
      }
    }
    
    return missingProperties;
  }
}