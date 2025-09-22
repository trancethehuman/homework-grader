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

    // Main feedback field - replaces all the individual fields
    properties.feedbacks = {
      type: "rich_text",
      rich_text: {},
    };

    // Feedback errors field - contains error messages when grading fails
    properties.feedback_errors = {
      type: "rich_text",
      rich_text: {},
    };

    // Browser testing properties (keep these for browser testing feature)
    properties.browser_test_conducted = {
      type: "checkbox",
      checkbox: {},
    };

    properties.browser_test_deployed_url = {
      type: "url",
      url: {},
    };

    properties.browser_test_success = {
      type: "checkbox",
      checkbox: {},
    };

    properties.browser_test_duration_ms = {
      type: "number",
      number: {},
    };

    properties.browser_test_actions_count = {
      type: "number",
      number: {},
    };

    properties.browser_test_screenshots_count = {
      type: "number",
      number: {},
    };

    properties.browser_test_errors = {
      type: "rich_text",
      rich_text: {},
    };

    properties.browser_test_page_title = {
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
    isUpdate: boolean = false,
    browserTestResult?: any,
    error?: string
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

    // Main feedback field - now contains all grading feedback as a single text
    properties.feedbacks = {
      rich_text: [
        {
          text: {
            content: gradingData?.feedbacks || "",
          },
        },
      ],
    };

    // Feedback errors field - contains error messages when grading fails
    properties.feedback_errors = {
      rich_text: [
        {
          text: {
            content: error || "", // Use error parameter if provided, otherwise empty
          },
        },
      ],
    };

    // Browser testing data (keep separate for functionality)
    if (browserTestResult) {
      properties.browser_test_conducted = {
        checkbox: true,
      };

      properties.browser_test_deployed_url = {
        url: browserTestResult.url || "",
      };

      properties.browser_test_success = {
        checkbox: browserTestResult.success || false,
      };

      properties.browser_test_duration_ms = {
        number: browserTestResult.duration || 0,
      };

      properties.browser_test_actions_count = {
        number: browserTestResult.actions?.length || 0,
      };

      properties.browser_test_screenshots_count = {
        number: browserTestResult.screenshots?.length || 0,
      };

      properties.browser_test_errors = {
        rich_text: [
          {
            text: {
              content: (browserTestResult.errors || []).join("; "),
            },
          },
        ],
      };

      properties.browser_test_page_title = {
        rich_text: [
          {
            text: {
              content: browserTestResult.metadata?.title || "",
            },
          },
        ],
      };
    } else {
      // No browser testing conducted
      properties.browser_test_conducted = {
        checkbox: false,
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
      "feedbacks", // Simplified to single feedback field
      "feedback_errors", // Error messages when grading fails
      "browser_test_conducted",
      "browser_test_deployed_url",
      "browser_test_success",
      "browser_test_duration_ms",
      "browser_test_actions_count",
      "browser_test_screenshots_count",
      "browser_test_errors",
      "browser_test_page_title",
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