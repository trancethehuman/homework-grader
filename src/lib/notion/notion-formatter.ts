export interface FormattedNotionContent {
  title: string;
  icon?: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  summary: string;
  blocks: FormattedBlock[];
  properties: FormattedProperty[];
}

export interface FormattedProperty {
  name: string;
  type: string;
  value: string;
}

export interface FormattedBlock {
  type: string;
  content: string;
  title?: string;
  id: string;
}

export class NotionFormatter {
  /**
   * Format Notion content for CLI display
   */
  static formatContent(content: any): FormattedNotionContent {
    if (content.type === "database") {
      return this.formatDatabaseContent(content);
    } else {
      return this.formatPageContent(content);
    }
  }

  /**
   * Format page content
   */
  private static formatPageContent(content: any): FormattedNotionContent {
    const page = content.page;
    const blocks = content.blocks || [];

    const title = this.extractTitle(page);
    const icon = page.icon?.emoji || page.icon?.file?.url || "";
    const url = page.url || "";
    const createdTime = new Date(page.created_time).toLocaleString();
    const lastEditedTime = new Date(page.last_edited_time).toLocaleString();
    
    const formattedBlocks = blocks.map((block: any) => this.formatBlock(block));
    const summary = this.generateSummary(page, blocks);
    const properties = this.extractProperties(page.properties || {});

    return {
      title,
      icon,
      url,
      createdTime,
      lastEditedTime,
      summary,
      blocks: formattedBlocks,
      properties,
    };
  }

  /**
   * Format database content
   */
  private static formatDatabaseContent(content: any): FormattedNotionContent {
    const database = content.database;
    const entries = content.entries || [];

    const title = this.extractDatabaseTitle(database);
    const icon = database.icon?.emoji || database.icon?.file?.url || "🗃️";
    const url = database.url || "";
    const createdTime = new Date(database.created_time).toLocaleString();
    const lastEditedTime = new Date(database.last_edited_time).toLocaleString();
    
    const formattedBlocks = entries.map((entry: any, index: number) => this.formatDatabaseEntry(entry, index));
    const summary = this.generateDatabaseSummary(database, entries);
    const properties = this.extractDatabaseProperties(database.properties || {});

    return {
      title,
      icon,
      url,
      createdTime,
      lastEditedTime,
      summary,
      blocks: formattedBlocks,
      properties,
    };
  }

  /**
   * Format a single block
   */
  private static formatBlock(block: any): FormattedBlock {
    const baseBlock = {
      type: block.type,
      id: block.id,
      content: "",
    };

    switch (block.type) {
      case "paragraph":
        baseBlock.content = this.extractRichText(block.paragraph?.rich_text || []);
        break;
      
      case "heading_1":
        baseBlock.content = this.extractRichText(block.heading_1?.rich_text || []);
        break;
      
      case "heading_2":
        baseBlock.content = this.extractRichText(block.heading_2?.rich_text || []);
        break;
      
      case "heading_3":
        baseBlock.content = this.extractRichText(block.heading_3?.rich_text || []);
        break;
      
      case "bulleted_list_item":
        baseBlock.content = this.extractRichText(block.bulleted_list_item?.rich_text || []);
        break;
      
      case "numbered_list_item":
        baseBlock.content = this.extractRichText(block.numbered_list_item?.rich_text || []);
        break;
      
      case "to_do":
        const checked = block.to_do?.checked ? "✓" : "○";
        const todoText = this.extractRichText(block.to_do?.rich_text || []);
        baseBlock.content = `${checked} ${todoText}`;
        break;
      
      case "code":
        const language = block.code?.language || "text";
        const codeText = this.extractRichText(block.code?.rich_text || []);
        baseBlock.content = `[${language}] ${codeText}`;
        break;
      
      case "child_database":
        const dbTitle = block.child_database?.title || "Untitled Database";
        baseBlock.content = `📊 ${dbTitle}`;
        (baseBlock as any).title = dbTitle;
        break;
      
      case "child_page":
        const pageTitle = block.child_page?.title || "Untitled Page";
        baseBlock.content = `📄 ${pageTitle}`;
        (baseBlock as any).title = pageTitle;
        break;
      
      case "image":
        const imageUrl = block.image?.external?.url || block.image?.file?.url || "";
        const caption = this.extractRichText(block.image?.caption || []);
        baseBlock.content = `🖼️ Image${caption ? `: ${caption}` : ""}`;
        break;
      
      case "video":
        const videoUrl = block.video?.external?.url || block.video?.file?.url || "";
        const videoCaption = this.extractRichText(block.video?.caption || []);
        baseBlock.content = `🎥 Video${videoCaption ? `: ${videoCaption}` : ""}`;
        break;
      
      case "file":
        const fileName = block.file?.name || "Unknown File";
        baseBlock.content = `📁 ${fileName}`;
        break;
      
      case "bookmark":
        const bookmarkUrl = block.bookmark?.url || "";
        baseBlock.content = `🔗 ${bookmarkUrl}`;
        break;
      
      case "divider":
        baseBlock.content = "─".repeat(50);
        break;
      
      case "callout":
        const calloutIcon = block.callout?.icon?.emoji || "💡";
        const calloutText = this.extractRichText(block.callout?.rich_text || []);
        baseBlock.content = `${calloutIcon} ${calloutText}`;
        break;
      
      case "quote":
        const quoteText = this.extractRichText(block.quote?.rich_text || []);
        baseBlock.content = `> ${quoteText}`;
        break;
      
      default:
        baseBlock.content = `[${block.type}] ${JSON.stringify(block).substring(0, 100)}...`;
    }

    return baseBlock;
  }

  /**
   * Extract plain text from rich text array
   */
  private static extractRichText(richTextArray: any[]): string {
    return richTextArray.map(rt => rt.plain_text || rt.text?.content || "").join("");
  }

  /**
   * Extract title from page properties
   */
  private static extractTitle(page: any): string {
    if (page.properties?.title?.title?.[0]?.plain_text) {
      return page.properties.title.title[0].plain_text;
    }
    if (page.properties?.Name?.title?.[0]?.plain_text) {
      return page.properties.Name.title[0].plain_text;
    }
    return "Untitled";
  }

  /**
   * Extract title from database
   */
  private static extractDatabaseTitle(database: any): string {
    if (database.title && database.title.length > 0) {
      return database.title[0].plain_text || "Untitled Database";
    }
    return "Untitled Database";
  }

  /**
   * Format a database entry
   */
  private static formatDatabaseEntry(entry: any, index: number): FormattedBlock {
    const title = this.extractTitle(entry);
    const url = entry.url || "";
    const createdTime = new Date(entry.created_time).toLocaleString();
    
    return {
      type: "database_entry",
      id: entry.id,
      content: `${index + 1}. ${title} (Created: ${createdTime})`,
      title: title
    };
  }

  /**
   * Generate summary for database
   */
  private static generateDatabaseSummary(database: any, entries: any[]): string {
    const propertyCount = Object.keys(database.properties || {}).length;
    const entryCount = entries.length;
    
    return `Database with ${propertyCount} properties and ${entryCount} entries`;
  }

  /**
   * Extract properties from page properties
   */
  private static extractProperties(properties: any): FormattedProperty[] {
    const formattedProperties: FormattedProperty[] = [];
    
    for (const [key, prop] of Object.entries(properties)) {
      if (key === 'title') continue; // Skip title as it's handled separately
      
      const property = prop as any;
      const formattedProp = this.formatProperty(key, property);
      if (formattedProp) {
        formattedProperties.push(formattedProp);
      }
    }
    
    return formattedProperties;
  }

  /**
   * Extract database schema properties
   */
  private static extractDatabaseProperties(properties: any): FormattedProperty[] {
    const formattedProperties: FormattedProperty[] = [];
    
    for (const [key, prop] of Object.entries(properties)) {
      const property = prop as any;
      formattedProperties.push({
        name: key,
        type: property.type || 'unknown',
        value: `${property.type} property` + (property.description ? ` - ${property.description}` : '')
      });
    }
    
    return formattedProperties;
  }

  /**
   * Format a single property
   */
  private static formatProperty(name: string, property: any): FormattedProperty | null {
    const type = property.type;
    let value = '';

    switch (type) {
      case 'rich_text':
        value = this.extractRichText(property.rich_text || []);
        break;
      case 'number':
        value = property.number?.toString() || '';
        break;
      case 'select':
        value = property.select?.name || '';
        break;
      case 'multi_select':
        value = (property.multi_select || []).map((s: any) => s.name).join(', ');
        break;
      case 'date':
        if (property.date) {
          value = property.date.start;
          if (property.date.end) {
            value += ` → ${property.date.end}`;
          }
        }
        break;
      case 'checkbox':
        value = property.checkbox ? '✓' : '○';
        break;
      case 'url':
        value = property.url || '';
        break;
      case 'email':
        value = property.email || '';
        break;
      case 'phone_number':
        value = property.phone_number || '';
        break;
      case 'formula':
        value = this.formatFormulaResult(property.formula);
        break;
      case 'relation':
        value = `${(property.relation || []).length} relation(s)`;
        break;
      case 'rollup':
        value = this.formatRollupResult(property.rollup);
        break;
      case 'people':
        value = (property.people || []).map((p: any) => p.name || p.id).join(', ');
        break;
      case 'files':
        value = `${(property.files || []).length} file(s)`;
        break;
      case 'created_time':
        value = new Date(property.created_time).toLocaleString();
        break;
      case 'last_edited_time':
        value = new Date(property.last_edited_time).toLocaleString();
        break;
      case 'created_by':
        value = property.created_by?.name || property.created_by?.id || '';
        break;
      case 'last_edited_by':
        value = property.last_edited_by?.name || property.last_edited_by?.id || '';
        break;
      case 'status':
        value = property.status?.name || '';
        break;
      default:
        value = JSON.stringify(property).substring(0, 50) + '...';
    }

    if (!value && type !== 'checkbox') {
      return null; // Skip empty properties
    }

    return {
      name,
      type,
      value
    };
  }

  /**
   * Format formula result
   */
  private static formatFormulaResult(formula: any): string {
    if (!formula) return '';
    
    switch (formula.type) {
      case 'string':
        return formula.string || '';
      case 'number':
        return formula.number?.toString() || '';
      case 'boolean':
        return formula.boolean ? '✓' : '○';
      case 'date':
        return formula.date?.start || '';
      default:
        return '';
    }
  }

  /**
   * Format rollup result
   */
  private static formatRollupResult(rollup: any): string {
    if (!rollup) return '';
    
    switch (rollup.type) {
      case 'number':
        return rollup.number?.toString() || '';
      case 'date':
        return rollup.date?.start || '';
      case 'array':
        return `Array with ${rollup.array?.length || 0} items`;
      default:
        return '';
    }
  }

  /**
   * Generate a summary of the page content
   */
  private static generateSummary(page: any, blocks: any[]): string {
    const blockTypes = blocks.reduce((acc: any, block: any) => {
      acc[block.type] = (acc[block.type] || 0) + 1;
      return acc;
    }, {});

    const summaryParts = [];
    
    if (blockTypes.child_database) {
      summaryParts.push(`${blockTypes.child_database} database${blockTypes.child_database > 1 ? 's' : ''}`);
    }
    if (blockTypes.child_page) {
      summaryParts.push(`${blockTypes.child_page} child page${blockTypes.child_page > 1 ? 's' : ''}`);
    }
    if (blockTypes.paragraph) {
      summaryParts.push(`${blockTypes.paragraph} paragraph${blockTypes.paragraph > 1 ? 's' : ''}`);
    }
    if (blockTypes.heading_1 || blockTypes.heading_2 || blockTypes.heading_3) {
      const headingCount = (blockTypes.heading_1 || 0) + (blockTypes.heading_2 || 0) + (blockTypes.heading_3 || 0);
      summaryParts.push(`${headingCount} heading${headingCount > 1 ? 's' : ''}`);
    }
    if (blockTypes.bulleted_list_item || blockTypes.numbered_list_item) {
      const listCount = (blockTypes.bulleted_list_item || 0) + (blockTypes.numbered_list_item || 0);
      summaryParts.push(`${listCount} list item${listCount > 1 ? 's' : ''}`);
    }
    if (blockTypes.to_do) {
      summaryParts.push(`${blockTypes.to_do} todo${blockTypes.to_do > 1 ? 's' : ''}`);
    }
    if (blockTypes.image) {
      summaryParts.push(`${blockTypes.image} image${blockTypes.image > 1 ? 's' : ''}`);
    }
    if (blockTypes.code) {
      summaryParts.push(`${blockTypes.code} code block${blockTypes.code > 1 ? 's' : ''}`);
    }

    if (summaryParts.length === 0) {
      return "Empty page";
    }

    return `Contains ${summaryParts.join(", ")}`;
  }

  /**
   * Create a formatted console output
   */
  static formatForConsole(content: any): string {
    const formatted = this.formatContent(content);
    
    const lines = [];
    lines.push("=".repeat(80));
    lines.push(`${formatted.icon} ${formatted.title}`);
    lines.push("=".repeat(80));
    lines.push(`📅 Created: ${formatted.createdTime}`);
    lines.push(`✏️  Last edited: ${formatted.lastEditedTime}`);
    lines.push(`🔗 URL: ${formatted.url}`);
    lines.push("=".repeat(80));
    
    // Properties section (like Notion)
    if (formatted.properties.length > 0) {
      lines.push("📝 PROPERTIES:");
      lines.push("");
      formatted.properties.forEach((prop) => {
        const propLine = `${prop.name}: ${prop.value}`;
        if (prop.type !== 'rich_text') {
          lines.push(`   ${propLine} (${prop.type})`);
        } else {
          lines.push(`   ${propLine}`);
        }
      });
      lines.push("=".repeat(80));
    }
    
    // Content section
    if (formatted.blocks.length > 0) {
      const contentLabel = content.type === "database" ? "📊 DATABASE ENTRIES:" : "📄 CONTENT:";
      lines.push(contentLabel);
      lines.push("");
      
      formatted.blocks.forEach((block, index) => {
        const prefix = `${index + 1}.`.padEnd(3);
        const typeInfo = `[${block.type}]`.padEnd(20);
        lines.push(`${prefix} ${typeInfo} ${block.content}`);
      });
    } else {
      const emptyLabel = content.type === "database" ? "📊 DATABASE: (No entries found)" : "📄 CONTENT: (No blocks found)";
      lines.push(emptyLabel);
    }
    
    lines.push("=".repeat(80));
    
    return lines.join("\n");
  }
}