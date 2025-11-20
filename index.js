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

    if (PROXY_USER && PROXY_PASS) {
      await page.authenticate({
        username: PROXY_USER,
        password: PROXY_PASS,
      });
    }

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

        // AMAZON
        if (url.includes("amazon.")) {
          log("Amazon extractor active");

          await waitForSelectorSafe(page, "[data-component-type='s-search-result']");

          extracted = await page.evaluate(() => {
            return [...document.querySelectorAll("[data-component-type='s-search-result']")]
              .map(el => ({
                title: el.querySelector("h2 span")?.innerText,
                price: el.querySelector(".a-price-whole")?.innerText,
                url: el.querySelector("h2 a")?.href,
                image: el.querySelector("img")?.src
              }))
              .filter(x => x.title);
          });
        }

        // ZILLOW
        else if (url.includes("zillow.com")) {
          log("Zillow extractor active");

          await waitForSelectorSafe(page, "article");

          extracted = await page.evaluate(() => {
            return [...document.querySelectorAll("article")]
              .map(card => ({
                title: card.querySelector("address")?.innerText,
                price: card.querySelector("span[data-test='property-price']")?.innerText,
                url: card.querySelector("a")?.href,
                image: card.querySelector("img")?.src
              }))
              .filter(x => x.title);
          });
        }

        // HN + GENERIC
        else {
          const selector = step.selector || "a";
          extracted = await page.$$eval(selector, els =>
            els.map(el => ({
              text: el.innerText?.trim(),
              href: el.href
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



