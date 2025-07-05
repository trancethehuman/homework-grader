const URLLoader = require('./url-loader');

async function example() {
  const loader = new URLLoader();
  
  try {
    const urls = await loader.loadUrlsFromCSV('./sample.csv');
    console.log('Loaded URLs:', urls);
    console.log('Total URLs in memory:', loader.getUrlCount());
  } catch (error) {
    console.error('Error:', error.message);
  }
}

if (require.main === module) {
  example();
}

module.exports = example;