const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class URLLoader {
  constructor() {
    this.urls = [];
  }

  async loadUrlsFromCSV(filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath) {
        reject(new Error('CSV file path is required'));
        return;
      }

      if (!fs.existsSync(filePath)) {
        reject(new Error(`CSV file not found: ${filePath}`));
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      if (extension !== '.csv') {
        reject(new Error(`Invalid file type. Expected .csv, got ${extension}`));
        return;
      }

      this.urls = [];
      const results = [];

      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          Object.values(row).forEach(value => {
            if (this.isValidURL(value)) {
              results.push(value);
            }
          });
        })
        .on('end', () => {
          this.urls = [...new Set(results)];
          console.log(`Loaded ${this.urls.length} unique URLs from ${filePath}`);
          resolve(this.urls);
        })
        .on('error', (error) => {
          reject(new Error(`Error reading CSV file: ${error.message}`));
        });
    });
  }

  isValidURL(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  getUrls() {
    return this.urls;
  }

  getUrlCount() {
    return this.urls.length;
  }

  clearUrls() {
    this.urls = [];
  }
}

module.exports = URLLoader;