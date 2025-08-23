export const DEPLOYED_URL_PATTERNS = [
  // Common hosting providers (for bonus confidence when URL patterns match)
  /https?:\/\/[a-zA-Z0-9-]+\.vercel\.app/g,
  /https?:\/\/[a-zA-Z0-9-]+\.netlify\.app/g,
  /https?:\/\/[a-zA-Z0-9-]+\.up\.railway\.app/g,
  /https?:\/\/[a-zA-Z0-9-]+\.onrender\.com/g,
  /https?:\/\/[a-zA-Z0-9-]+\.herokuapp\.com/g,
  /https?:\/\/[a-zA-Z0-9-]+\.github\.io/g,
  /https?:\/\/[a-zA-Z0-9-]+\.web\.app/g,
  /https?:\/\/[a-zA-Z0-9-]+\.firebaseapp\.com/g,
  /https?:\/\/[a-zA-Z0-9-]+\.surge\.sh/g,
  /https?:\/\/[a-zA-Z0-9-]+\.pages\.dev/g,
  /https?:\/\/[a-zA-Z0-9-]+\.ondigitalocean\.app/g,
  /https?:\/\/[a-zA-Z0-9-]+\.amplifyapp\.com/g,
  /https?:\/\/[a-zA-Z0-9-]+\.azurestaticapps\.net/g,
  
  // General web URLs (very permissive for custom domains)
  /https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
];

export const DEPLOYED_URL_HOSTING_PROVIDERS = [
  { name: "Vercel", patterns: ["vercel.app", "now.sh"] },
  { name: "Netlify", patterns: ["netlify.app", "netlify.com"] },
  { name: "Railway", patterns: ["up.railway.app"] },
  { name: "Render", patterns: ["onrender.com"] },
  { name: "Heroku", patterns: ["herokuapp.com"] },
  { name: "GitHub Pages", patterns: ["github.io"] },
  { name: "Firebase", patterns: ["web.app", "firebaseapp.com"] },
  { name: "Surge", patterns: ["surge.sh"] },
  { name: "Cloudflare Pages", patterns: ["pages.dev"] },
  { name: "DigitalOcean", patterns: ["ondigitalocean.app"] },
  { name: "AWS Amplify", patterns: ["amplifyapp.com"] },
  { name: "Azure", patterns: ["azurestaticapps.net"] },
];

// Primary indicators - column names that strongly suggest deployed apps
export const DEPLOYED_URL_PROPERTY_KEYWORDS = {
  // High confidence keywords (80-100 points)
  high: ['deployed', 'deployment', 'demo', 'live', 'production', 'prod', 'app', 'website', 'site'],
  
  // Medium confidence keywords (40-60 points)
  medium: ['url', 'link', 'web', 'host', 'domain', 'public'],
  
  // Low confidence keywords (20-30 points)  
  low: ['preview', 'staging', 'dev', 'test']
};

// Exclusion keywords that reduce confidence (e.g., these are likely source code, not deployed apps)
export const EXCLUSION_KEYWORDS = ['github', 'repo', 'repository', 'source', 'code', 'git'];

// Testing configuration
export const BROWSER_TESTING_CONFIG = {
  MAX_CONCURRENT_TABS: 10,
  TEST_DURATION_MS: 30000, // 30 seconds per URL
  SCREENSHOT_INTERVAL_MS: 5000, // Screenshot every 5 seconds
  ACTION_DELAY_MS: 2000, // 2 seconds between actions
};