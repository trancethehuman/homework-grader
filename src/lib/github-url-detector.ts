export interface GitHubUrlCandidate {
  propertyName: string;
  propertyType: string;
  confidence: number;
  sampleUrls: string[];
  totalUrls: number;
}

export interface GitHubUrlDetectionResult {
  candidates: GitHubUrlCandidate[];
  topCandidate: GitHubUrlCandidate | null;
  hasGitHubUrls: boolean;
}

export class GitHubUrlDetector {
  private static readonly GITHUB_URL_PATTERNS = [
    /https?:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/g,
    /github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/g,
  ];

  private static readonly PROPERTY_NAME_KEYWORDS = [
    'github', 'repo', 'repository', 'url', 'link', 'project', 'code', 'source'
  ];

  static detectGitHubUrls(notionContent: any): GitHubUrlDetectionResult {
    const candidates: GitHubUrlCandidate[] = [];

    // Handle database content structure from getDatabaseContent()
    if (notionContent && notionContent.type === "database") {
      const database = notionContent.database;
      const entries = notionContent.entries || [];

      // Analyze database schema properties against actual entry data
      if (database && database.properties) {
        for (const [propertyName, propertyDefinition] of Object.entries(database.properties)) {
          const candidate = this.analyzeDatabaseProperty(propertyName, propertyDefinition as any, entries);
          if (candidate.totalUrls > 0) {
            candidates.push(candidate);
          }
        }
      }
    }
    // Handle legacy formatted content structure
    else if (notionContent && notionContent.object) {
      const formatted = notionContent.object;

      // Check properties if it's a database
      if (formatted.properties && Array.isArray(formatted.properties)) {
        for (const property of formatted.properties) {
          const candidate = this.analyzeProperty(property);
          if (candidate.totalUrls > 0) {
            candidates.push(candidate);
          }
        }
      }

      // Check blocks for any GitHub URLs
      if (formatted.blocks && Array.isArray(formatted.blocks)) {
        const blockCandidate = this.analyzeBlocks(formatted.blocks);
        if (blockCandidate.totalUrls > 0) {
          candidates.push(blockCandidate);
        }
      }
    }
    // Handle when no valid structure is found
    else {
      return {
        candidates: [],
        topCandidate: null,
        hasGitHubUrls: false
      };
    }

    // Sort by confidence score
    candidates.sort((a, b) => b.confidence - a.confidence);

    return {
      candidates,
      topCandidate: candidates.length > 0 ? candidates[0] : null,
      hasGitHubUrls: candidates.length > 0
    };
  }

  private static analyzeDatabaseProperty(propertyName: string, propertyDefinition: any, entries: any[]): GitHubUrlCandidate {
    const propertyType = propertyDefinition.type || '';
    let allUrls: string[] = [];

    // Extract URLs from all database entries for this property
    for (const entry of entries) {
      if (entry.properties && entry.properties[propertyName]) {
        const propertyValue = entry.properties[propertyName];
        let valueText = '';

        // Extract the actual value based on property type
        switch (propertyType) {
          case 'url':
            valueText = propertyValue.url || '';
            break;
          case 'rich_text':
            valueText = (propertyValue.rich_text || [])
              .map((rt: any) => rt.plain_text || rt.text?.content || '')
              .join('');
            break;
          case 'title':
            valueText = (propertyValue.title || [])
              .map((rt: any) => rt.plain_text || rt.text?.content || '')
              .join('');
            break;
          default:
            // For other types, try to extract text representation
            if (typeof propertyValue === 'string') {
              valueText = propertyValue;
            } else if (propertyValue.plain_text) {
              valueText = propertyValue.plain_text;
            }
        }

        if (valueText) {
          const urls = this.extractGitHubUrls(valueText);
          allUrls.push(...urls);
        }
      }
    }

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(allUrls));
    const confidence = this.calculatePropertyConfidence(propertyName, propertyType, uniqueUrls.length);

    return {
      propertyName,
      propertyType,
      confidence,
      sampleUrls: uniqueUrls.slice(0, 3), // Show max 3 sample URLs
      totalUrls: uniqueUrls.length
    };
  }

  private static analyzeProperty(property: any): GitHubUrlCandidate {
    const propertyName = property.name || '';
    const propertyType = property.type || '';
    const propertyValue = property.value || '';

    const urls = this.extractGitHubUrls(propertyValue);
    const confidence = this.calculatePropertyConfidence(propertyName, propertyType, urls.length);

    return {
      propertyName,
      propertyType,
      confidence,
      sampleUrls: urls.slice(0, 3), // Show max 3 sample URLs
      totalUrls: urls.length
    };
  }

  private static analyzeBlocks(blocks: any[]): GitHubUrlCandidate {
    let allUrls: string[] = [];

    for (const block of blocks) {
      if (block.content) {
        const urls = this.extractGitHubUrls(block.content);
        allUrls.push(...urls);
      }
    }

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(allUrls));

    return {
      propertyName: 'Page Content',
      propertyType: 'blocks',
      confidence: uniqueUrls.length > 0 ? 30 : 0, // Lower confidence for block content
      sampleUrls: uniqueUrls.slice(0, 3),
      totalUrls: uniqueUrls.length
    };
  }

  static extractGitHubUrls(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const urls: string[] = [];
    
    for (const pattern of this.GITHUB_URL_PATTERNS) {
      const matches = text.match(pattern);
      if (matches) {
        urls.push(...matches);
      }
    }

    // Clean and validate URLs
    return urls
      .map(url => {
        // Ensure URL starts with https://
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
        return url;
      })
      .filter(url => this.isValidGitHubRepoUrl(url))
      .map(url => url.replace(/\.git$/, '')) // Remove .git suffix if present
      .filter((url, index, array) => array.indexOf(url) === index); // Remove duplicates
  }

  private static calculatePropertyConfidence(
    propertyName: string, 
    propertyType: string, 
    urlCount: number
  ): number {
    if (urlCount === 0) return 0;

    let confidence = urlCount * 20; // Base score from URL count

    // Boost for property name keywords
    const lowerName = propertyName.toLowerCase();
    for (const keyword of this.PROPERTY_NAME_KEYWORDS) {
      if (lowerName.includes(keyword)) {
        confidence += 30;
        break;
      }
    }

    // Boost for URL-type properties
    if (propertyType === 'url') {
      confidence += 25;
    } else if (propertyType === 'rich_text') {
      confidence += 15;
    }

    // Cap at 100
    return Math.min(confidence, 100);
  }

  private static isValidGitHubRepoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Must be github.com
      if (urlObj.hostname !== 'github.com') {
        return false;
      }

      // Must have owner/repo format
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      if (pathParts.length < 2) {
        return false;
      }

      // Check if it looks like a valid repo path (owner/repo)
      const owner = pathParts[0];
      const repo = pathParts[1];
      
      // Basic validation - no dots at start, reasonable length
      if (owner.startsWith('.') || repo.startsWith('.') || 
          owner.length < 1 || repo.length < 1 ||
          owner.length > 100 || repo.length > 100) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  static extractGitHubUrlsFromProperty(property: any): string[] {
    // Handle legacy formatted property structure
    if (property.value) {
      return this.extractGitHubUrls(property.value);
    }

    // Handle raw Notion property structure
    if (property.type) {
      let valueText = '';
      
      switch (property.type) {
        case 'url':
          valueText = property.url || '';
          break;
        case 'rich_text':
          valueText = (property.rich_text || [])
            .map((rt: any) => rt.plain_text || rt.text?.content || '')
            .join('');
          break;
        case 'title':
          valueText = (property.title || [])
            .map((rt: any) => rt.plain_text || rt.text?.content || '')
            .join('');
          break;
        default:
          if (typeof property === 'string') {
            valueText = property;
          } else if (property.plain_text) {
            valueText = property.plain_text;
          }
      }
      
      return this.extractGitHubUrls(valueText);
    }

    return [];
  }
}