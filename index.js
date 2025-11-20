// ================================
// AI WEB WORKER RUNNER (STEALTH MODE + PUPPETEER 22 COMPATIBLE)
// ================================

import express from "express";
import cors from "cors";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import { autoScroll } from "./utils/scroll.js";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

// --------------------------------------
// Helper utilities
// --------------------------------------

async function retry(fn, attempts = 3, delay = 800) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function waitForSelectorSafe(page, selector, timeout = 15000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

async function takeScreenshot(page) {
  const base64 = await page.screenshot({ encoding: "base64", fullPage: true });
  return `data:image/png;base64,${base64}`;
}

// --------------------------------------
// Main execution route
// --------------------------------------
app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) {
    return res.status(400).json({ error: "plan must be an array" });
  }

  let logs = [];
  let screenshots = [];

  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  let browser;

  try {
    log("Launching Chrome with stealth...");

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--start-maximized",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });

    // Hide webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    log(`Plan contains ${plan.length} steps`);

    let extracted = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];

      log(`--- Step ${i + 1}/${plan.length} ---`);
      log(JSON.stringify(step));

      // ---------------------------
      // open_page
      // ---------------------------
      if (step.action === "open_page") {
        log("Opening page: " + step.url);

        await page.goto(step.url, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });

        // Increased delay for anti-bot negotiation
        await new Promise((r) => setTimeout(r, 5000));

        log("Scrolling page to load dynamic content...");
        await autoScroll(page);

        // Simulate human mouse movement
        await page.mouse.move(200, 300);
        await page.mouse.move(400, 500);
        await page.mouse.move(600, 200);

        screenshots.push(await takeScreenshot(page));
      }

      // ---------------------------
      // wait
      // ---------------------------
      else if (step.action === "wait") {
        const ms =
          step.duration ||
          step.milliseconds ||
          (step.seconds ? step.seconds * 1000 : 0);

        log(`Waiting for ${ms}ms`);
        await new Promise((r) => setTimeout(r, ms));
      }

      // ---------------------------
      // extract_list (FINAL FORCE MODE)
      // ---------------------------
      else if (step.action === "extract_list") {
        log("Extracting list…");

        const domain = page.url();

        extracted = await retry(async () => {
          // ================= AMAZON =================
          if (domain.includes("amazon.")) {
            log("Amazon FORCE render extractor");

            await Promise.race([
              page.waitForSelector("div.s-main-slot"),
              page.waitForSelector("div.sg-col-inner"),
              page.waitForSelector("span.a-size-medium"),
            ]);

            await autoScroll(page, 30);

            return await page.evaluate(() => {
              const cards = [...document.querySelectorAll("div[data-component-type='s-search-result']")];

              return cards
                .map((card) => {
                  const title = card.querySelector("h2 span")?.innerText;
                  const priceWhole = card.querySelector(".a-price-whole")?.innerText;
                  const priceFraction = card.querySelector(".a-price-fraction")?.innerText;
                  const image = card.querySelector("img")?.src;
                  const url = card.querySelector("h2 a")?.href;

                  if (!title) return null;

                  return {
                    title,
                    price: priceWhole
                      ? `$${priceWhole}${priceFraction ? "." + priceFraction : ""}`
                      : null,
                    image,
                    url,
                  };
                })
                .filter(Boolean);
            });
          }

          // ================= ZILLOW =================
          if (domain.includes("zillow.com")) {
            log("Zillow FORCE render extractor");

            await page.waitForSelector("article", { timeout: 20000 });
            await autoScroll(page, 30);

            return await page.evaluate(() => {
              const cards = [...document.querySelectorAll("article")];

              return cards
                .map((card) => {
                  const title = card.querySelector("address")?.innerText;
                  const price =
                    card.querySelector("span[data-test='property-card-price']")?.innerText ||
                    card.querySelector("span[data-test='property-price']")?.innerText;
                  const image = card.querySelector("img")?.src;
                  const url =
                    card.querySelector("a[data-test='property-card-link']")?.href ||
                    card.querySelector("a")?.href;

                  if (!title) return null;

                  return { title, price, image, url };
                })
                .filter(Boolean);
            });
          }

          // ============ FALLBACK GENERIC ============
          log("Using generic extractor");
          const selector = step.selector || "a";

          return await page.$$eval(selector, (els) =>
            els.map((el) => ({
              text: el.innerText?.trim() || "",
              href: el.href || null,
            }))
          );
        });

        extracted = extracted.slice(0, step.limit || step.count || 20);

        log(
          `Extracted ${extracted.length} items — sample: ${JSON.stringify(
            extracted.slice(0, 3),
            null,
            2
          )}`
        );
      } else {
        log("Unknown action: " + step.action);
      }
    }

    return res.json({
      logs,
      result: extracted,
      screenshots,
    });
  } catch (err) {
    console.error(err);
    logs.push("FATAL ERROR: " + err.message);
    return res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) {
      await browser.close();
      logs.push("Browser closed");
    }
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Runner backend listening on port " + PORT);
});



