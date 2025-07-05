import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parser';

export class URLLoader {
  private urls: string[] = [];

  async loadFromCSV(filePath: string): Promise<string[]> {
    this.validateFile(filePath);
    
    const urls: string[] = [];
    const urlSet = new Set<string>();

    return new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row: Record<string, string>) => {
          Object.values(row).forEach(value => {
            if (this.isValidURL(value)) {
              const normalizedUrl = value.trim().toLowerCase();
              if (!urlSet.has(normalizedUrl)) {
                urlSet.add(normalizedUrl);
                urls.push(value.trim());
              }
            }
          });
        })
        .on('end', () => {
          this.urls = urls;
          resolve(urls);
        })
        .on('error', (error) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  }

  getUrls(): string[] {
    return [...this.urls];
  }

  getUrlCount(): number {
    return this.urls.length;
  }

  private validateFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (path.extname(filePath).toLowerCase() !== '.csv') {
      throw new Error(`Invalid file type. Expected .csv file, got: ${path.extname(filePath)}`);
    }
  }

  private isValidURL(url: string): boolean {
    if (!url || typeof url !== 'string') {
      return false;
    }

    const trimmedUrl = url.trim();
    return trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://');
  }
}