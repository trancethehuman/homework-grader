export interface FormattedNotionContent {
  title: string;
  icon?: string;
  url: string;
  createdTime: string;
  lastEditedTime: string;
  summary: string;
  blocks: FormattedBlock[];
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
    const page = content.page;
    const blocks = content.blocks || [];

    const title = this.extractTitle(page);
    const icon = page.icon?.emoji || page.icon?.file?.url || "";
    const url = page.url || "";
    const createdTime = new Date(page.created_time).toLocaleString();
    const lastEditedTime = new Date(page.last_edited_time).toLocaleString();
    
    const formattedBlocks = blocks.map((block: any) => this.formatBlock(block));
    const summary = this.generateSummary(page, blocks);

    return {
      title,
      icon,
      url,
      createdTime,
      lastEditedTime,
      summary,
      blocks: formattedBlocks,
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
    lines.push(`📋 Summary: ${formatted.summary}`);
    lines.push("=".repeat(80));
    
    if (formatted.blocks.length > 0) {
      lines.push("📄 CONTENT:");
      lines.push("");
      
      formatted.blocks.forEach((block, index) => {
        const prefix = `${index + 1}.`.padEnd(3);
        const typeInfo = `[${block.type}]`.padEnd(20);
        lines.push(`${prefix} ${typeInfo} ${block.content}`);
      });
    } else {
      lines.push("📄 CONTENT: (No blocks found)");
    }
    
    lines.push("=".repeat(80));
    
    return lines.join("\n");
  }
}