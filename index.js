// ============================================
// AI WEB WORKER RUNNER - EXTRACTION REPAIR CORE
// ============================================

import express from "express";
import cors from "cors";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

app.get("/", (req, res) => res.json({ status: "runner-online" }));

const wait = ms => new Promise(r => setTimeout(r, ms));

// ================= RUNNER =================
app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  let logs = [];
  const log = m => { console.log(m); logs.push(m); };
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        `--proxy-server=http://${PROXY_HOST}:${PROXY_PORT}`,
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage();

    if (PROXY_USER) {
      await page.authenticate({ username: PROXY_USER, password: PROXY_PASS });
    }

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    );

    let extracted = [];

    for (const step of plan) {

      if (step.action === "open_page") {
        log("Opening " + step.url);
        await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 60000 });
        await wait(4000);
      }

      if (step.action === "extract_list") {
        const url = page.url();
        log("Extracting from " + url);

        // ---------------- HACKER NEWS ----------------
        if (url.includes("news.ycombinator.com")) {
          extracted = await page.evaluate(() => {
            return Array.from(document.querySelectorAll(".athing"))
              .map(row => ({
                title: row.querySelector(".titleline a")?.innerText,
                url: row.querySelector(".titleline a")?.href
              }))
              .filter(x => x.title);
          });
        }

        // ---------------- GENERIC FALLBACK ----------------
        if (extracted.length === 0) {
          extracted = await page.evaluate(() => {
            return Array.from(document.querySelectorAll("a"))
              .filter(a => a.innerText && a.innerText.length > 15)
              .slice(0, 30)
              .map(a => ({
                title: a.innerText.trim(),
                url: a.href
              }));
          });
        }

        log(`✅ Extracted ${extracted.length} items`);
      }
    }

    res.json({ result: extracted, logs });

  } catch (err) {
    logs.push("ERROR: " + err.message);
    res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Runner ready:", PORT));




