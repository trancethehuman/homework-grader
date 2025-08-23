import { 
  DEPLOYED_URL_PATTERNS, 
  DEPLOYED_URL_HOSTING_PROVIDERS, 
  DEPLOYED_URL_PROPERTY_KEYWORDS,
  EXCLUSION_KEYWORDS
} from "../consts/deployed-url-patterns.js";

export interface DeployedUrlCandidate {
  propertyName: string;
  propertyType: string;
  confidence: number;
  sampleUrls: string[];
  totalUrls: number;
  detectedProvider?: string;
}

export interface DeployedUrlDetectionResult {
  candidates: DeployedUrlCandidate[];
  topCandidate: DeployedUrlCandidate | null;
  hasDeployedUrls: boolean;
}

export class DeployedUrlDetector {
  static detectDeployedUrls(notionContent: any): DeployedUrlDetectionResult {
    const candidates: DeployedUrlCandidate[] = [];

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

      // Check blocks for any deployed URLs
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
        hasDeployedUrls: false
      };
    }

    // Sort by confidence score (column name-based confidence is primary)
    candidates.sort((a, b) => b.confidence - a.confidence);

    return {
      candidates,
      topCandidate: candidates.length > 0 ? candidates[0] : null,
      hasDeployedUrls: candidates.length > 0
    };
  }

  private static analyzeDatabaseProperty(propertyName: string, propertyDefinition: any, entries: any[]): DeployedUrlCandidate {
    const propertyType = propertyDefinition.type || '';
    let allUrls: string[] = [];
    let detectedProvider: string | undefined;

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
          const urls = this.extractDeployedUrls(valueText);
          allUrls.push(...urls);
          
          // Detect hosting provider from first URL
          if (!detectedProvider && urls.length > 0) {
            detectedProvider = this.detectHostingProvider(urls[0]);
          }
        }
      }
    }

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(allUrls));
    const confidence = this.calculatePropertyConfidence(propertyName, propertyType, uniqueUrls);

    return {
      propertyName,
      propertyType,
      confidence,
      sampleUrls: uniqueUrls.slice(0, 3), // Show max 3 sample URLs
      totalUrls: uniqueUrls.length,
      detectedProvider
    };
  }

  private static analyzeProperty(property: any): DeployedUrlCandidate {
    const propertyName = property.name || '';
    const propertyType = property.type || '';
    const propertyValue = property.value || '';

    const urls = this.extractDeployedUrls(propertyValue);
    const confidence = this.calculatePropertyConfidence(propertyName, propertyType, urls);
    const detectedProvider = urls.length > 0 ? this.detectHostingProvider(urls[0]) : undefined;

    return {
      propertyName,
      propertyType,
      confidence,
      sampleUrls: urls.slice(0, 3), // Show max 3 sample URLs
      totalUrls: urls.length,
      detectedProvider
    };
  }

  private static analyzeBlocks(blocks: any[]): DeployedUrlCandidate {
    let allUrls: string[] = [];

    for (const block of blocks) {
      if (block.content) {
        const urls = this.extractDeployedUrls(block.content);
        allUrls.push(...urls);
      }
    }

    // Remove duplicates
    const uniqueUrls = Array.from(new Set(allUrls));
    const detectedProvider = uniqueUrls.length > 0 ? this.detectHostingProvider(uniqueUrls[0]) : undefined;

    return {
      propertyName: 'Page Content',
      propertyType: 'blocks',
      confidence: uniqueUrls.length > 0 ? 20 : 0, // Lower confidence for block content
      sampleUrls: uniqueUrls.slice(0, 3),
      totalUrls: uniqueUrls.length,
      detectedProvider
    };
  }

  static extractDeployedUrls(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const urls: string[] = [];
    
    for (const pattern of DEPLOYED_URL_PATTERNS) {
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
      .filter(url => this.isValidWebUrl(url))
      .filter(url => !this.isGitHubRepoUrl(url)) // Exclude GitHub repository URLs
      .filter((url, index, array) => array.indexOf(url) === index); // Remove duplicates
  }

  private static calculatePropertyConfidence(
    propertyName: string, 
    propertyType: string, 
    urls: string[]
  ): number {
    if (urls.length === 0) return 0;

    let confidence = 0;

    // PRIMARY FACTOR: Column name keywords (this is most important)
    const lowerName = propertyName.toLowerCase();
    
    // Check for exclusion keywords first (GitHub, repo, etc.)
    for (const exclusionKeyword of EXCLUSION_KEYWORDS) {
      if (lowerName.includes(exclusionKeyword)) {
        confidence -= 40; // Heavy penalty for exclusion keywords
        break;
      }
    }

    // High confidence keywords
    for (const keyword of DEPLOYED_URL_PROPERTY_KEYWORDS.high) {
      if (lowerName.includes(keyword)) {
        confidence += 80;
        break; // Only count the first match to avoid over-scoring
      }
    }

    // Medium confidence keywords (only if no high confidence keyword found)
    if (confidence < 80) {
      for (const keyword of DEPLOYED_URL_PROPERTY_KEYWORDS.medium) {
        if (lowerName.includes(keyword)) {
          confidence += 50;
          break;
        }
      }
    }

    // Low confidence keywords (only if no higher confidence keyword found)
    if (confidence < 50) {
      for (const keyword of DEPLOYED_URL_PROPERTY_KEYWORDS.low) {
        if (lowerName.includes(keyword)) {
          confidence += 30;
          break;
        }
      }
    }

    // SECONDARY FACTOR: Property type bonus
    if (propertyType === 'url') {
      confidence += 20;
    } else if (propertyType === 'rich_text') {
      confidence += 10;
    }

    // TERTIARY FACTOR: URL count and hosting provider detection
    confidence += Math.min(urls.length * 5, 20); // Up to 20 points for multiple URLs

    // Bonus for recognized hosting providers
    for (const url of urls) {
      const provider = this.detectHostingProvider(url);
      if (provider && provider !== "Custom Domain") {
        confidence += 15;
        break; // Only count once
      }
    }

    // Ensure minimum confidence if we have valid web URLs
    if (confidence < 20 && urls.length > 0) {
      confidence = 20;
    }

    // Cap at 100
    return Math.max(0, Math.min(confidence, 100));
  }

  private static detectHostingProvider(url: string): string | undefined {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      for (const provider of DEPLOYED_URL_HOSTING_PROVIDERS) {
        for (const pattern of provider.patterns) {
          if (hostname.includes(pattern)) {
            return provider.name;
          }
        }
      }

      return "Custom Domain";
    } catch {
      return undefined;
    }
  }

  private static isValidWebUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Must be http or https
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Must have a hostname
      if (!urlObj.hostname || urlObj.hostname.length < 3) {
        return false;
      }

      // Must have a valid TLD
      const parts = urlObj.hostname.split('.');
      if (parts.length < 2 || parts[parts.length - 1].length < 2) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private static isGitHubRepoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // If it's github.com with a repo path, exclude it
      if (urlObj.hostname === 'github.com') {
        const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
        // GitHub repo URLs have at least owner/repo format
        if (pathParts.length >= 2) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  static extractDeployedUrlsFromProperty(property: any): string[] {
    // Handle legacy formatted property structure
    if (property.value) {
      return this.extractDeployedUrls(property.value);
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
      
      return this.extractDeployedUrls(valueText);
    }

    return [];
  }
}