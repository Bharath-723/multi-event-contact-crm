const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '../public/sw.js');

try {
  let swContent = fs.readFileSync(swPath, 'utf8');

  // Replace CACHE_NAME line with a unique build-specific cache name
  const newVersion = `rathayatra-online-v${Date.now()}`;
  swContent = swContent.replace(
    /const CACHE_NAME = 'rathayatra-online-v[^']*';/,
    `const CACHE_NAME = '${newVersion}';`
  );

  fs.writeFileSync(swPath, swContent, 'utf8');
  console.log(`[PWA Build] Successfully updated CACHE_NAME in sw.js to: ${newVersion}`);
} catch (error) {
  console.error('[PWA Build] Failed to update CACHE_NAME in sw.js:', error);
  process.exit(1);
}
