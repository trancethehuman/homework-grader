import { URLLoader } from "../url-loader.js";

const main = async () => {
  const loader = new URLLoader();

  // Load from a local CSV file
  const csvPath = "sample.csv";
  const urls = await loader.loadFromCSV(csvPath);

  console.log(`Loaded ${urls.length} URLs from ${csvPath}:`);
  urls.forEach((url: string, index: number) => {
    console.log(`${index + 1}. ${url}`);
  });
};

main().catch(console.error);
