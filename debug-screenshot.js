const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1024 }
  });

  const page = await context.newPage();

  // Listen to console messages
  page.on('console', msg => {
    const type = msg.type();
    console.log(`[Browser ${type}]:`, msg.text());
  });

  // Listen to page errors
  page.on('pageerror', error => {
    console.error('[Browser Error]:', error.message);
  });

  try {
    await page.goto('http://localhost:5173', { timeout: 10000 });
    await page.waitForTimeout(3000);

    // Check if anything rendered
    const html = await page.content();
    console.log('\n=== Page HTML (first 500 chars) ===');
    console.log(html.substring(0, 500));

    await page.screenshot({ path: 'debug-screenshot.png' });
    console.log('\nScreenshot saved to debug-screenshot.png');
  } catch (error) {
    console.error('Error:', error.message);
  }

  await browser.close();
})();
