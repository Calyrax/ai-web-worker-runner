// ============================================
// AI WEB WORKER RUNNER
// SMARTPROXY + PUPPETEER 22 - MAX RELIABILITY
// ============================================

import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import { autoScroll } from "./utils/scroll.js";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function safeWait(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// MAIN RUNNER
// ============================================
app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) {
    return res.status(400).json({ error: "plan must be array" });
  }

  let logs = [];
  const log = (m) => { console.log(m); logs.push(m); };
  let browser;

  try {
    log("Launching Chrome with Smartproxy...");

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1920,1080"
      ]
    });

    const page = await browser.newPage();

    if (PROXY_USER && PROXY_PASS) {
      await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
    }

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    );

    await page.setViewport({ width: 1920, height: 1080 });

    let extracted = [];

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      log(`--- Step ${i + 1}/${plan.length} ---`);
      log(JSON.stringify(step));

      // ================= OPEN PAGE =================
      if (step.action === "open_page") {
        log("Opening page: " + step.url);

        await page.goto(step.url, {
          waitUntil: "networkidle2",
          timeout: 90000
        });

        await wait(4000);
        await autoScroll(page);
        await wait(3000);
      }

      // ================= WAIT =================
      if (step.action === "wait") {
        const ms = step.milliseconds || 3000;
        log(`Waiting ${ms}ms`);
        await wait(ms);
      }

      // ================= EXTRACT =================
      if (step.action === "extract_list") {
        log("Extracting list...");
        const url = page.url();

        // 🔎 DEBUG snapshot
        await page.screenshot({ path: "debug.png", fullPage: true });

        // ================= AMAZON =================
        if (url.includes("amazon.")) {
          log("Amazon extractor active");

          const found = await safeWait(page, "div[data-component-type='s-search-result']", 40000);
          if (!found) log("Amazon results NOT detected");

          extracted = await page.evaluate(() => {
            const cards = document.querySelectorAll("div[data-component-type='s-search-result']");
            return Array.from(cards).map(el => ({
              title: el.querySelector("h2 span")?.innerText?.trim(),
              price: el.querySelector(".a-price-whole")?.innerText,
              url: el.querySelector("h2 a")?.href,
              image: el.querySelector("img")?.src
            })).filter(x => x.title);
          });
        }

        // ================= ZILLOW =================
        if (url.includes("zillow.com")) {
          log("Zillow extractor active");

          const found = await safeWait(page, "article", 40000);
          if (!found) log("Zillow listings NOT detected");

          extracted = await page.evaluate(() => {
            const cards = document.querySelectorAll("article");
            return Array.from(cards).map(el => ({
              title: el.querySelector("address")?.innerText?.trim(),
              price: el.querySelector("[data-test='property-price']")?.innerText,
              url: el.querySelector("a")?.href,
              image: el.querySelector("img")?.src
            })).filter(x => x.title);
          });
        }

        extracted = extracted.slice(0, step.limit || 20);
        log(`✅ Extracted ${extracted.length} items`);

        // If ZERO, save HTML for debug
        if (extracted.length === 0) {
          const html = await page.content();
          fs.writeFileSync("debug.html", html);
          log("⚠️ ZERO RESULTS - HTML snapshot saved");
        }
      }
    }

    res.json({ logs, result: extracted });

  } catch (err) {
    logs.push("FATAL: " + err.message);
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Runner listening on " + PORT));




