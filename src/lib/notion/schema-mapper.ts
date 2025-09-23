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
    options: { skipGithubUrlColumn?: boolean; processingMode?: 'code' | 'browser' | 'both' } = {}
  ): Record<string, NotionProperty> {
    const properties: Record<string, NotionProperty> = {};

    // Repository identification (Title column) - only add if requested
    if (includeTitle) {
      properties["Repository Name"] = {
        type: "title",
        title: {},
      };
    }

    // Repository metadata - only add if not skipped
    if (!options.skipGithubUrlColumn) {
      properties["GitHub URL"] = {
        type: "url",
        url: {},
      };
    }

    // Always include graded_at timestamp
    properties["Graded At"] = {
      type: "date",
      date: {},
    };

    const processingMode = options.processingMode || 'both';

    // Include grading fields only for 'code' and 'both' modes
    if (processingMode === 'code' || processingMode === 'both') {
      // Repository summary field - short explanation of what the project is about
      properties["Repository Summary"] = {
        type: "rich_text",
        rich_text: {},
      };

      // Developer feedback field - actionable bullet points for developers
      properties["Developer Feedback"] = {
        type: "rich_text",
        rich_text: {},
      };

      // Feedback errors field - contains error messages when grading fails
      properties["Feedback Errors"] = {
        type: "rich_text",
        rich_text: {},
      };
    }

    // Include browser testing fields only for 'browser' and 'both' modes
    if (processingMode === 'browser' || processingMode === 'both') {
      properties["Browser Test Conducted"] = {
        type: "checkbox",
        checkbox: {},
      };

      properties["Browser Test URL"] = {
        type: "url",
        url: {},
      };

      properties["Browser Test Success"] = {
        type: "checkbox",
        checkbox: {},
      };

      properties["Browser Test Duration (ms)"] = {
        type: "number",
        number: {},
      };

      properties["Browser Test Actions"] = {
        type: "number",
        number: {},
      };

      properties["Browser Test Screenshots"] = {
        type: "number",
        number: {},
      };

      properties["Browser Test Errors"] = {
        type: "rich_text",
        rich_text: {},
      };

      properties["Browser Test Page Title"] = {
        type: "rich_text",
        rich_text: {},
      };
    }

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
    error?: string,
    processingMode: 'code' | 'browser' | 'both' = 'both'
  ): Record<string, any> {
    const properties: Record<string, any> = {};

    // Set the title property only for new entries (don't overwrite for updates)
    if (!isUpdate) {
      const titleProp = titlePropertyName || "Repository Name";
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

    // Use the existing GitHub URL column name or default to "GitHub URL"
    const githubUrlProp = githubUrlColumnName || "GitHub URL";
    // Only set GitHub URL for new entries (existing rows already have it)
    if (!isUpdate) {
      properties[githubUrlProp] = {
        url: githubUrl,
      };
    }

    // Always include graded_at timestamp
    properties["Graded At"] = {
      date: {
        start: new Date().toISOString(),
      },
    };

    // Include grading fields only for 'code' and 'both' modes
    if (processingMode === 'code' || processingMode === 'both') {
      // Repository summary field - short explanation of what the project is about
      properties["Repository Summary"] = {
        rich_text: [
          {
            text: {
              content: gradingData?.repo_explained || "",
            },
          },
        ],
      };

      // Developer feedback field - actionable bullet points for developers
      properties["Developer Feedback"] = {
        rich_text: [
          {
            text: {
              content: gradingData?.developer_feedback || "",
            },
          },
        ],
      };

      // Feedback errors field - contains error messages when grading fails
      properties["Feedback Errors"] = {
        rich_text: [
          {
            text: {
              content: error || "", // Use error parameter if provided, otherwise empty
            },
          },
        ],
      };
    }

    // Include browser testing fields only for 'browser' and 'both' modes
    if (processingMode === 'browser' || processingMode === 'both') {
      if (browserTestResult) {
        properties["Browser Test Conducted"] = {
          checkbox: true,
        };

        properties["Browser Test URL"] = {
          url: browserTestResult.url || "",
        };

        properties["Browser Test Success"] = {
          checkbox: browserTestResult.success || false,
        };

        properties["Browser Test Duration (ms)"] = {
          number: browserTestResult.duration || 0,
        };

        properties["Browser Test Actions"] = {
          number: browserTestResult.actions?.length || 0,
        };

        properties["Browser Test Screenshots"] = {
          number: browserTestResult.screenshots?.length || 0,
        };

        properties["Browser Test Errors"] = {
          rich_text: [
            {
              text: {
                content: (browserTestResult.errors || []).join("; "),
              },
            },
          ],
        };

        properties["Browser Test Page Title"] = {
          rich_text: [
            {
              text: {
                content: browserTestResult.metadata?.title || "",
              },
            },
          ],
        };
      } else {
        // No browser testing conducted but in browser/both mode
        properties["Browser Test Conducted"] = {
          checkbox: false,
        };
      }
    }

    return properties;
  }

  /**
   * Get list of grading property names (for checking existing database schema)
   */
  static getGradingPropertyNames(): string[] {
    return [
      "Repository Name",
      "GitHub URL",
      "Graded At",
      "Repository Summary", // Short explanation of what the project is about
      "Developer Feedback", // Actionable bullet points for developers
      "Feedback Errors", // Error messages when grading fails
      "Browser Test Conducted",
      "Browser Test URL",
      "Browser Test Success",
      "Browser Test Duration (ms)",
      "Browser Test Actions",
      "Browser Test Screenshots",
      "Browser Test Errors",
      "Browser Test Page Title",
    ];
  }

  /**
   * Check if database has all required grading properties
   */
  static hasGradingProperties(
    databaseProperties: Record<string, any>,
    options: { processingMode?: 'code' | 'browser' | 'both' } = {}
  ): boolean {
    // Generate required properties based on processing mode
    const requiredProperties = this.generateGradingDatabaseProperties(false, {
      skipGithubUrlColumn: false,
      processingMode: options.processingMode || 'both'
    });
    const existingProperties = Object.keys(databaseProperties);

    // Check if all required properties exist
    return Object.keys(requiredProperties).every(prop => existingProperties.includes(prop));
  }

  /**
   * Get missing grading properties from database schema
   */
  static getMissingGradingProperties(
    databaseProperties: Record<string, any>,
    options: { skipGithubUrlColumn?: boolean; processingMode?: 'code' | 'browser' | 'both' } = {}
  ): Record<string, NotionProperty> {
    const processingMode = options.processingMode || 'both';

    // Check if database already has a title property
    const hasExistingTitle = Object.values(databaseProperties).some((prop: any) => prop.type === "title");

    // Generate required properties, excluding title if one already exists, and optionally skip github_url
    const requiredProperties = this.generateGradingDatabaseProperties(!hasExistingTitle, {
      skipGithubUrlColumn: options.skipGithubUrlColumn,
      processingMode: processingMode
    });
    const existingProperties = Object.keys(databaseProperties);
    const missingProperties: Record<string, NotionProperty> = {};

    console.log(`🔍 Checking for missing grading properties (mode: ${processingMode})`);
    console.log(`📋 Required properties:`, Object.keys(requiredProperties));
    console.log(`📋 Existing properties:`, existingProperties);

    for (const [propertyName, propertyConfig] of Object.entries(requiredProperties)) {
      if (!existingProperties.includes(propertyName)) {
        missingProperties[propertyName] = propertyConfig;
        console.log(`❌ Missing property: ${propertyName} (${propertyConfig.type})`);
      } else {
        console.log(`✅ Found existing property: ${propertyName}`);
      }
    }

    if (Object.keys(missingProperties).length === 0) {
      console.log(`✅ All required grading properties exist in database`);
    } else {
      console.log(`📝 Will add ${Object.keys(missingProperties).length} missing properties:`, Object.keys(missingProperties));
    }

    return missingProperties;
  }
}