// ================================
// AI WEB WORKER RUNNER (STEALTH MODE + PUPPETEER 22 COMPATIBLE)
// ================================

import express from "express";
import cors from "cors";

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

// --------------------------------------
// Main execution route
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
    log("Launching Chrome with stealth...");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Spoof a real browser
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

        // Puppeteer 22+ → no waitForTimeout()
        await new Promise((r) => setTimeout(r, 2000));
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
      // extract_list
      // ---------------------------
      else if (step.action === "extract_list") {
        log("Extracting list…");

        const domain = page.url();
        let selector = step.selector;

        if (!selector) {
          if (domain.includes("news.ycombinator.com")) {
            selector = ".titleline > a";
            log("Auto-selector: Hacker News");
          } else if (domain.includes("amazon.com")) {
            selector = "h2 a.a-link-normal";
            log("Auto-selector: Amazon products");
          } else if (domain.includes("zillow.com")) {
            selector = ".list-card-info a";
            log("Auto-selector: Zillow listings");
          } else {
            selector = "a";
            log("Fallback selector: a");
          }
        }

        log("Using selector: " + selector);

        const items = await page.$$eval(selector, (els) =>
          els.map((el) => ({
            text: el.innerText?.trim() || "",
            href: el.href || null,
          }))
        );

        extracted = items.slice(0, step.limit || 20);
        log(
          `Extracted ${extracted.length} items — sample: ${JSON.stringify(
            extracted.slice(0, 3),
            null,
            2
          )}`
        );
      }

      else {
        log("Unknown action: " + step.action);
      }
    }

    return res.json({ logs, result: extracted });
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

