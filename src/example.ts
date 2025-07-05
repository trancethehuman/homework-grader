import { URLLoader } from './url-loader';

async function example() {
  const loader = new URLLoader();
  
  try {
    const urls = await loader.loadFromCSV('./sample.csv');
    console.log('Example usage of URLLoader:');
    console.log(`Loaded ${urls.length} URLs from sample.csv`);
    
    urls.forEach((url, index) => {
      console.log(`${index + 1}. ${url}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

example();