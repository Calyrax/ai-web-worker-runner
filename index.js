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

const wait = (ms) => new Promise(r => setTimeout(r, ms));

app.get("/", (_, res) => res.json({ status: "runner-online" }));

async function launchBrowser(useProxy = true) {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--window-size=1920,1080"
  ];

  if (useProxy && PROXY_HOST) {
    args.unshift(`--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`);
  }

  return puppeteer.launch({
    headless: "new",
    args
  });
}

app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) return res.status(400).json({ error: "plan must be array" });

  let logs = [];
  const log = m => { console.log(m); logs.push(m); };

  let browser;
  let page;

  try {
    log("🚀 Launching Chrome with Smartproxy...");

    browser = await launchBrowser(true);
    page = await browser.newPage();

    if (PROXY_USER) {
      await page.authenticate({
        username: PROXY_USER,
        password: PROXY_PASS
      });
    }

    await page.setUserAgent("Mozilla/5.0 Chrome/120 Safari/537.36");

    let extracted = [];

    for (const step of plan) {
      if (step.action === "open_page") {
        log("🌍 Opening " + step.url);

        try {
          await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch {
          log("⚠️ Proxy failed, retrying without proxy...");
          await browser.close();

          browser = await launchBrowser(false);
          page = await browser.newPage();
          await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        }

        await wait(3000);
        await autoScroll(page);
      }

      if (step.action === "extract_list") {
        const url = page.url();
        log("🔍 Extracting from " + url);

        if (url.includes("ycombinator.com")) {
          extracted = await page.evaluate(() =>
            Array.from(document.querySelectorAll(".athing")).map(row => ({
              title: row.querySelector(".titleline a")?.innerText,
              link: row.querySelector(".titleline a")?.href
            })).filter(x => x.title)
          );
        }

        extracted = extracted.slice(0, step.limit || 20);
        log(`✅ Extracted ${extracted.length} items`);
      }
    }

    res.json({ logs, result: extracted });

  } catch (err) {
    logs.push("❌ ERROR: " + err.message);
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Runner live on port " + PORT));





