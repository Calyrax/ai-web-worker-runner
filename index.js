// ==========================================
// AI WEB WORKER RUNNER — FULL STEALTH VERSION
// ==========================================

import express from "express";
import cors from "cors";

// Puppeteer (stealth)
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Enable stealth mode
puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --------------------------------------
// Health check
// --------------------------------------
app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

// --------------------------------------
// MAIN EXECUTION ROUTE
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
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Chrome from Dockerfile
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();

    // Fake a real Chrome user
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9"
    });

    let extracted = [];

    log(`Plan contains ${plan.length} steps`);

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      log(`--- Step ${i + 1}/${plan.length} ---`);
      log(JSON.stringify(step));

      // OPEN PAGE
      if (step.action === "open_page") {
        log(`Opening page: ${step.url}`);
        await page.goto(step.url, {
          waitUntil: "networkidle2",
          timeout: 60000
        });
        await page.waitForTimeout(2000);
      }

      // WAIT
      else if (step.action === "wait") {
        const ms =
          step.duration ||
          step.milliseconds ||
          (step.seconds ? step.seconds * 1000 : 0);

        log(`Waiting for ${ms}ms`);
        await page.waitForTimeout(ms);
      }

      // EXTRACT LIST
      else if (step.action === "extract_list") {
        log("Extracting list…");

        let selector = step.selector;
        const url = page.url();

        if (!selector) {
          if (url.includes("ycombinator.com")) {
            selector = ".titleline > a";
            log("Auto-selector for Hacker News");
          } else if (url.includes("amazon.com")) {
            selector = "h2 a.a-link-normal";
            log("Auto-selector for Amazon");
          } else if (url.includes("zillow.com")) {
            selector = ".list-card-info a";
            log("Auto-selector for Zillow");
          } else {
            selector = "a";
            log("Fallback selector: a");
          }
        }

        log("Using selector: " + selector);

        const items = await page.$$eval(selector, (elements) =>
          elements.map((el) => ({
            text: el.innerText?.trim() || "",
            href: el.href || ""
          }))
        );

        extracted = items.slice(0, step.limit || 20);
        log(
          `Extracted ${extracted.length} items — sample: ` +
            JSON.stringify(extracted.slice(0, 3), null, 2)
        );
      }

      // UNKNOWN ACTION
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
      logs.push("Browser closed.");
    }
  }
});

// --------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Runner backend listening on port " + PORT);
});


