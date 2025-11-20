// utils/scroll.js

export async function autoScroll(page, maxScroll = 20) {
  for (let i = 0; i < maxScroll; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(700 + Math.random() * 300);
  }
}
