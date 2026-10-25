const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 }
  });

  // Screenshot 1: Reference HTML
  console.log('Taking screenshot of reference HTML...');
  const page1 = await context.newPage();
  const refHtmlPath = path.join(__dirname, 'design', 'reference', 'connect.html');
  await page1.goto(`file://${refHtmlPath}`);
  await page1.waitForTimeout(1000); // Wait for fonts to load
  await page1.screenshot({
    path: 'screenshot-reference-connect.png',
    fullPage: true
  });
  console.log('✓ Reference screenshot saved: screenshot-reference-connect.png');

  // Screenshot 2: React Component
  console.log('Taking screenshot of React component...');
  const page2 = await context.newPage();

  // Try to connect to the dashboard (dashboard.html entry point)
  try {
    await page2.goto('http://localhost:5173/dashboard.html', { timeout: 5000 });
    await page2.waitForTimeout(2000); // Wait for fonts and rendering
    await page2.screenshot({
      path: 'screenshot-react-connect.png',
      fullPage: true
    });
    console.log('✓ React screenshot saved: screenshot-react-connect.png');
  } catch (error) {
    console.error('Error: Could not connect to development server.');
    console.error('Please run "npm run dev" first, then run this script again.');
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log('\n✓ Screenshots complete! Compare:');
  console.log('  - screenshot-reference-connect.png');
  console.log('  - screenshot-react-connect.png');
})();
