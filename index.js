// ======================================
// AI WEB WORKER RUNNER (STEALTH + CHROME FIX)
// ======================================

import express from "express";
import cors from "cors";

// Stealth Puppeteer (requires FULL puppeteer installed)
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ------------------------------------
// HEALTH CHECK
// ------------------------------------
app.get("/", (req, res) => {
  res.json({ status: "runner-online" });
});

// Utility for logging
function pushLog(logs, msg) {
  console.log(msg);
  logs.push(msg);
}

// ------------------------------------
// MAIN EXECUTION ROUTE
// ------------------------------------
app.post("/run", async (req, res) => {
  const plan = req.body.plan;
  const logs = [];

  if (!Array.isArray(plan)) {
    return res.status(400).json({
      error: "plan must be an array",
      logs,
    });
  }

  let browser = null;
  let extracted = [];

  try {
    pushLog(logs, "Launching browser with stealth...");

    // ⭐ FIX: puppeteer.executablePath() ensures Chrome exists
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: puppeteer.executablePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    // Fake a real browser fingerprint
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"
    );

    await page.setExtraHTTPHeaders({
      "accept-language": "en-US,en;q=0.9",
    });

    pushLog(logs, `Plan contains ${plan.length} steps`);

    // =====================================
    // EXECUTE EACH STEP
    // =====================================
    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      pushLog(logs, `--- Step ${i + 1}/${plan.length} ---`);
      pushLog(logs, JSON.stringify(step));

      // ----------------------------
      // OPEN PAGE
      // ----------------------------
      if (step.action === "open_page") {
        pushLog(logs, "Opening page: " + step.url);

        await page.goto(step.url, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });

        await page.waitForTimeout(2000);
      }

      // ----------------------------
      // WAIT STEP
      // ----------------------------
      else if (step.action === "wait") {
        const ms =
          step.duration ||
          step.milliseconds ||
          (step.seconds ? step.seconds * 1000 : 0);

        pushLog(logs, `Waiting ${ms}ms`);
        await page.waitForTimeout(ms);
      }

      // ----------------------------
      // EXTRACT LIST (auto site detection)
      // ----------------------------
      else if (step.action === "extract_list") {
        pushLog(logs, "Extracting list…");

        let selector = step.selector;
        const url = page.url();

        // Auto-select based on domain
        if (!selector) {
          if (url.includes("news.ycombinator.com")) {
            selector = ".titleline > a";
            pushLog(logs, "Auto-selector: Hacker News");
          } else if (url.includes("amazon.com")) {
            selector = "h2 a.a-link-normal";
            pushLog(logs, "Auto-selector: Amazon");
          } else if (url.includes("zillow.com")) {
            selector = ".list-card-info a";
            pushLog(logs, "Auto-selector: Zillow");
          } else {
            selector = "a";
            pushLog(logs, "Fallback selector: a");
          }
        }

        pushLog(logs, "Using selector: " + selector);

        const items = await page.$$eval(selector, (elements) =>
          elements.map((el) => ({
            text: el.innerText?.trim() || "",
            href: el.href || null,
          }))
        );

        extracted = items.slice(0, step.limit || step.count || 20);

        pushLog(
          logs,
          `Extracted ${extracted.length} items — sample: ${JSON.stringify(
            extracted.slice(0, 3),
            null,
            2
          )}`
        );
      }

      // ----------------------------
      // UNKNOWN ACTION
      // ----------------------------
      else {
        pushLog(logs, "Unknown action: " + step.action);
      }
    }

    return res.json({ logs, result: extracted });
  } catch (err) {
    pushLog(logs, "FATAL ERROR: " + err.message);
    return res.status(500).json({ error: err.message, logs });
  } finally {
    if (browser) {
      pushLog(logs, "Closing browser...");
      await browser.close();
      pushLog(logs, "Browser closed");
    }
  }
});

// ------------------------------------
// PORT
// ------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Runner backend listening on port " + PORT);
});

