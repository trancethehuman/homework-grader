#!/usr/bin/env node

import { URLLoader } from './url-loader';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npm run dev <path-to-csv-file>');
    console.error('Example: npm run dev sample.csv');
    process.exit(1);
  }

  const csvFilePath = args[0];
  const loader = new URLLoader();

  try {
    console.log(`Loading URLs from: ${csvFilePath}`);
    const urls = await loader.loadFromCSV(csvFilePath);
    
    console.log(`\nLoaded ${urls.length} unique URLs into memory:`);
    urls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
    
    console.log(`\nTotal URLs loaded: ${loader.getUrlCount()}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);