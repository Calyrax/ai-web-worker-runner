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

app.get("/", (_, res) => {
  res.json({ status: "runner-online" });
});

app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  if (!Array.isArray(plan)) return res.status(400).json({ error: "plan must be array" });

  let logs = [];
  const log = m => { console.log(m); logs.push(m); };

  let browser;

  try {
    log("🚀 Launching hardened Chrome...");

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-features=IsolateOrigins",
        "--disable-site-isolation-trials",
        "--window-size=1920,1080"
      ]
    });

    const page = await browser.newPage();

    if (PROXY_USER) {
      await page.authenticate({
        username: PROXY_USER,
        password: PROXY_PASS
      });
    }

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36"
    );

    await page.setViewport({ width: 1920, height: 1080 });

    let extracted = [];

    for (const step of plan) {

      if (step.action === "open_page") {
        log("🌐 Opening " + step.url);

        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });

        await wait(4000);

        if (page.url().startsWith("chrome-error")) {
          throw new Error("Chrome failed to load target page");
        }

        await autoScroll(page);
      }

      if (step.action === "extract_list") {
        const url = page.url();
        log("🔍 Extracting from: " + url);

        // === HN FIXED SELECTORS ===
        if (url.includes("ycombinator.com")) {
          extracted = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".athing")).map(row => {
              const title = row.querySelector(".titleline a")?.innerText;
              const link = row.querySelector(".titleline a")?.href;
              return { title, link };
            }).filter(x => x.title);
          });
        }

        // === AMAZON ===
        else if (url.includes("amazon.")) {
          extracted = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("div[data-component-type='s-search-result']"))
              .map(el => ({
                title: el.querySelector("h2 span")?.innerText,
                price: el.querySelector(".a-price-whole")?.innerText,
                url: el.querySelector("h2 a")?.href
              })).filter(Boolean);
          });
        }

        // === ZILLOW ===
        else if (url.includes("zillow.com")) {
          extracted = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("article")).map(el => ({
              title: el.querySelector("address")?.innerText,
              price: el.querySelector("[data-test='property-price']")?.innerText,
              link: el.querySelector("a")?.href
            })).filter(Boolean);
          });
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
app.listen(PORT, () => console.log("Runner live on " + PORT));




