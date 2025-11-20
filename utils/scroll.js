// utils/scroll.js - Puppeteer v22 SAFE

export async function autoScroll(page, maxScroll = 20) {
  for (let i = 0; i < maxScroll; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    // Safe delay replacement for waitForTimeout
    await new Promise(resolve => setTimeout(resolve, 800));
  }
}
