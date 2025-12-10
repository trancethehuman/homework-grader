export interface NotionUrlParseResult {
  isValid: boolean;
  id?: string;
  error?: string;
}

export class NotionUrlParser {
  private static NOTION_URL_PATTERN = /^https?:\/\/(www\.)?notion\.so\//i;
  private static ID_PATTERN =
    /[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;

  static isNotionUrl(input: string): boolean {
    return this.NOTION_URL_PATTERN.test(input.trim());
  }

  static parseUrl(input: string): NotionUrlParseResult {
    const trimmed = input.trim();

    if (!this.isNotionUrl(trimmed)) {
      return {
        isValid: false,
        error: "Not a Notion URL",
      };
    }

    const idMatch = trimmed.match(this.ID_PATTERN);

    if (!idMatch) {
      return {
        isValid: false,
        error: "Could not extract page/database ID from URL",
      };
    }

    const rawId = idMatch[0];
    const normalizedId = this.normalizeId(rawId);

    return {
      isValid: true,
      id: normalizedId,
    };
  }

  static normalizeId(id: string): string {
    const cleanId = id.replace(/-/g, "").toLowerCase();

    if (cleanId.length !== 32) {
      return id;
    }

    return `${cleanId.slice(0, 8)}-${cleanId.slice(8, 12)}-${cleanId.slice(12, 16)}-${cleanId.slice(16, 20)}-${cleanId.slice(20)}`;
  }
}
