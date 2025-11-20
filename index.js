// ================================
// AI WEB WORKER RUNNER (SMARTPROXY + PUPPETEER 22)
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

// ================================
// ENV PROXY CONFIG (FROM RAILWAY VARIABLES)
// ================================
const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

// Health check
app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

// --------------------------------------
// Helpers
// --------------------------------------
async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForSelectorSafe(page, selector, timeout = 20000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

// --------------------------------------
// Main runner route
// --------------------------------------
app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) {
    return res.status(400).json({ error: "plan must be an array" });
  }

  let logs = [];
  const log = (msg) => {
    console.log(msg);
    logs.push(msg);
  };

  let browser;

  try {
    log("Launching Chrome with Smartproxy...");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Proxy auth
    if (PROXY_USER && PROXY_PASS) {
      await page.authenticate({
        username: PROXY_USER,
        password: PROXY_PASS,
      });
    }

    // Make it look like a real desktop browser
    await page.setViewport({ width: 1366, height: 900 });
    await page.emulateMediaFeatures([
      { name: "prefers-color-scheme", value: "light" },
    ]);

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    );

    log(`Plan contains ${plan.length} steps`);

    let extracted = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];

      log(`--- Step ${i + 1}/${plan.length} ---`);
      log(JSON.stringify(step));

      // OPEN PAGE
      if (step.action === "open_page") {
        log("Opening page: " + step.url);

        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });

        await wait(3000);
        log("Auto scrolling...");
        await autoScroll(page);
        await wait(2000);
      }

      // WAIT
      else if (step.action === "wait") {
        const ms =
          step.milliseconds ||
          (typeof step.duration === "string"
            ? parseInt(step.duration) * 1000
            : 0);
        log(`Waiting ${ms}ms`);
        await wait(ms);
      }

      // EXTRACT LIST
      else if (step.action === "extract_list") {
        log("Extracting list...");
        const url = page.url();

        // ============== AMAZON ==================
        if (url.includes("amazon.")) {
          log("Amazon REAL DOM extractor");

          // Wait for main result grid
          await page.waitForSelector("div.s-main-slot", { timeout: 25000 });

          // Extra scroll passes to force lazy-load
          await autoScroll(page);
          await autoScroll(page);

          extracted = await page.evaluate(() => {
            const products = document.querySelectorAll(
              "div[data-component-type='s-search-result']"
            );

            return Array.from(products)
              .map((el) => {
                const title = el.querySelector("h2 span")?.innerText?.trim();
                const priceWhole =
                  el.querySelector(".a-price-whole")?.innerText || null;
                const priceFraction =
                  el.querySelector(".a-price-fraction")?.innerText || "";
                const image = el.querySelector("img")?.src || null;
                const url =
                  el.querySelector("a.a-link-normal")?.href ||
                  el.querySelector("h2 a")?.href ||
                  null;

                if (!title) return null;

                const price = priceWhole
                  ? `${priceWhole}${priceFraction ? "." + priceFraction : ""}`
                  : null;

                return {
                  title,
                  price,
                  url,
                  image,
                };
              })
              .filter((x) => x && x.title);
          });
        }

        // ============== ZILLOW ==================
        else if (url.includes("zillow.com")) {
          log("Zillow REAL DOM extractor");

          await page.waitForSelector("article", { timeout: 25000 });
          await autoScroll(page);

          extracted = await page.evaluate(() => {
            const cards = document.querySelectorAll("article");

            return Array.from(cards)
              .map((card) => {
                const title = card.querySelector("address")?.innerText || null;
                const price =
                  card.querySelector(
                    "span[data-test='property-price'], span[data-test='property-card-price']"
                  )?.innerText || null;
                const url = card.querySelector("a")?.href || null;
                const image = card.querySelector("img")?.src || null;

                if (!title) return null;

                return { title, price, url, image };
              })
              .filter((x) => x && x.title);
          });
        }

        // ============== HN + GENERIC =============
        else {
          const selector = step.selector || "a";
          extracted = await page.$$eval(selector, (els) =>
            els.map((el) => ({
              text: el.innerText?.trim(),
              href: el.href,
            }))
          );
        }

        extracted = extracted.slice(0, step.limit || 20);
        log(`Extracted ${extracted.length} items`);
      }
    }

    return res.json({ logs, result: extracted });
  } catch (err) {
    logs.push("FATAL ERROR: " + err.message);
    return res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Runner backend listening on port " + PORT);
});



