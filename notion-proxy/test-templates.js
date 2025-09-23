import fs from 'fs';
import path from 'path';

// Test template loading
function loadTemplate(templateName) {
  const templatePath = path.join(process.cwd(), 'templates', `${templateName}.html`);
  try {
    return fs.readFileSync(templatePath, 'utf8');
  } catch (error) {
    console.warn(`Could not load template ${templateName}.html:`, error.message);
    return null;
  }
}

console.log('Testing template loading...');

// Test success template
const successTemplate = loadTemplate('success');
if (successTemplate) {
  console.log('✓ Success template loaded successfully');
  console.log(`  Length: ${successTemplate.length} characters`);
} else {
  console.log('✗ Failed to load success template');
}

// Test error template
const errorTemplate = loadTemplate('error');
if (errorTemplate) {
  console.log('✓ Error template loaded successfully');
  console.log(`  Length: ${errorTemplate.length} characters`);

  // Test template replacement
  const testError = 'Test error message';
  const processedTemplate = errorTemplate.replace('{{ERROR_MESSAGE}}', testError);
  if (processedTemplate.includes(testError)) {
    console.log('✓ Template placeholder replacement works');
  } else {
    console.log('✗ Template placeholder replacement failed');
  }
} else {
  console.log('✗ Failed to load error template');
}

console.log('Template testing complete.');