#!/usr/bin/env node

import { URLLoader } from './url-loader';
import { GitHubService } from './github/github-service';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: npm run dev <path-to-csv-file>');
    console.error('Example: npm run dev sample.csv');
    process.exit(1);
  }

  const csvFilePath = args[0];
  const loader = new URLLoader();
  const githubService = new GitHubService();

  try {
    console.log(`Loading URLs from: ${csvFilePath}`);
    const urls = await loader.loadFromCSV(csvFilePath);
    
    console.log(`\nLoaded ${urls.length} unique URLs into memory:`);
    urls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
    
    console.log(`\nTotal URLs loaded: ${loader.getUrlCount()}`);
    
    const githubUrls = urls.filter(url => url.includes('github.com'));
    console.log(`\nFound ${githubUrls.length} GitHub URLs`);
    
    if (githubUrls.length > 0) {
      console.log('\nProcessing GitHub repositories...');
      
      for (let i = 0; i < githubUrls.length; i++) {
        const url = githubUrls[i];
        console.log(`\nProcessing GitHub URL ${i + 1}/${githubUrls.length}: ${url}`);
        
        try {
          const repoInfo = githubService.parseGitHubUrl(url);
          if (repoInfo) {
            console.log(`Fetching files from ${repoInfo.owner}/${repoInfo.repo}...`);
            const concatenatedContent = await githubService.processGitHubUrl(url);
            
            const fileName = `${repoInfo.owner}-${repoInfo.repo}.md`;
            const filePath = join('test-results', fileName);
            
            writeFileSync(filePath, concatenatedContent);
            console.log(`✓ Saved to ${filePath}`);
          }
        } catch (error) {
          console.error(`✗ Error processing ${url}:`, error);
        }
      }
      
      console.log('\nAll GitHub URLs processed successfully!');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);