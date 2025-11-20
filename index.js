import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { autoScroll } from "./utils/scroll.js";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

const wait = ms => new Promise(r => setTimeout(r, ms));

app.get("/", (_, res) => res.json({ status: "runner-online" }));

async function launchBrowser(useProxy = true) {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-features=IsolateOrigins,site-per-process",
    "--allow-running-insecure-content",
    "--ignore-certificate-errors",
    "--ignore-ssl-errors",
    "--window-size=1920,1080"
  ];

  if (useProxy && PROXY_HOST) {
    args.push(`--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`);
  }

  return puppeteer.launch({
    headless: true,
    args
  });
}

app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) return res.status(400).json({ error: "plan must be array" });

  let logs = [];
  const log = msg => (console.log(msg), logs.push(msg));

  let browser;
  let page;
  let extracted = [];

  try {
    log("🚀 Launching Chrome with Smartproxy...");
    browser = await launchBrowser(true);
    page = await browser.newPage();

    if (PROXY_USER && PROXY_PASS) {
      await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
    }

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    for (const step of plan) {
      if (step.action === "open_page") {
        log(`🌐 Opening ${step.url}`);

        await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 60000 });

        if (page.url().startsWith("chrome-error://")) {
          log("⚠️ Proxy SSL failed - restarting without proxy...");
          await browser.close();

          browser = await launchBrowser(false);
          page = await browser.newPage();

          await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        }

        await autoScroll(page);
      }

      if (step.action === "wait") {
        await wait(step.duration ? step.duration * 1000 : 2000);
      }

      if (step.action === "extract_list") {
        const url = page.url();
        log("🔍 Extracting from " + url);

        if (url.includes("ycombinator.com")) {
          extracted = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".athing")).map(row => ({
              title: row.querySelector(".titleline a")?.innerText,
              url: row.querySelector(".titleline a")?.href
            }))
          );
        }

        else if (url.includes("amazon.")) {
          extracted = await page.evaluate(() =>
            Array.from(document.querySelectorAll("div[data-component-type='s-search-result']")).map(el => ({
              title: el.querySelector("h2 span")?.innerText,
              price: el.querySelector(".a-price-whole")?.innerText,
              url: el.querySelector("h2 a")?.href
            }))
          );
        }

        else if (url.includes("zillow.com")) {
          extracted = await page.evaluate(() =>
            Array.from(document.querySelectorAll("article")).map(card => ({
              title: card.querySelector("address")?.innerText,
              price: card.querySelector("[data-test='property-price']")?.innerText,
              url: card.querySelector("a")?.href
            }))
          );
        }

        extracted = extracted.filter(Boolean).slice(0, step.limit || 30);
        log(`✅ Extracted ${extracted.length} items`);
      }
    }

    res.json({ logs, result: extracted });

  } catch (err) {
    log("❌ ERROR: " + err.message);
    res.status(500).json({ error: err.message, logs });

  } finally {
    if (browser) await browser.close();
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Runner live on port", process.env.PORT || 3000)
);







