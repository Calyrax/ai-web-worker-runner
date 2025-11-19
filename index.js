const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());

// Health-check
app.get("/", (req, res) => {
  res.send("AI Web Worker Runner is alive ✅");
});

/**
 * Utility: push log AND print to Railway logs
 */
function logAndPrint(logs, msg) {
  console.log(msg);
  logs.push(msg);
}

app.post("/run", async (req, res) => {
  const logs = [];
  let browser;

  logAndPrint(logs, "=== Incoming /run request ===");
  logAndPrint(logs, "Body received: " + JSON.stringify(req.body, null, 2));

  // Support both {plan} and {commands}
  const plan = req.body.plan || req.body.commands;

  if (!plan || !Array.isArray(plan)) {
    logAndPrint(logs, "ERROR: plan missing or not an array");
    return res.status(400).json({
      error: "plan must be an array of steps",
      logs,
    });
  }

  try {
    logAndPrint(logs, "Launching Chromium...");

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    let extracted = [];

    logAndPrint(logs, `Plan contains ${plan.length} steps`);

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      logAndPrint(logs, `--- Step ${i + 1}/${plan.length} ---`);
      logAndPrint(logs, JSON.stringify(step));

      if (!step.action) {
        logAndPrint(logs, "ERROR: Missing 'action' key in step");
        continue;
      }

      try {
        switch (step.action) {
          case "open_page":
            logAndPrint(logs, "Opening page: " + step.url);
            await page.goto(step.url, { waitUntil: "networkidle2" });
            break;

          case "click":
            logAndPrint(logs, "Clicking selector: " + step.selector);
            await page.click(step.selector);
            break;

          case "type":
            logAndPrint(logs, `Typing into ${step.selector}: ${step.text}`);
            await page.type(step.selector, step.text);
            break;

          case "wait":
            const ms =
              step.milliseconds ||
              step.value ||
              (step.seconds ? step.seconds * 1000 : 0);

            logAndPrint(logs, `Waiting for ${ms}ms`);
            await new Promise((resolve) => setTimeout(resolve, ms));
            break;

          case "extract_list":
            logAndPrint(logs, `Extracting list from: ${step.selector}`);
            const items = await page.$$eval(step.selector, (elements) =>
              elements.map((el) => ({
                text: el.textContent?.trim() || "",
                href: el.href || null,
              }))
            );

            extracted = items.slice(0, step.limit || 30);
            logAndPrint(
              logs,
              `Extracted ${extracted.length} items: ` +
                JSON.stringify(extracted.slice(0, 3), null, 2) +
                "..."
            );
            break;

          default:
            logAndPrint(logs, "ERROR: Unknown action: " + step.action);
            break;
        }
      } catch (stepErr) {
        logAndPrint(
          logs,
          `ERROR executing step ${i + 1} (${step.action}): ${stepErr.message}`
        );
      }
    }

    logAndPrint(logs, "Task finished successfully.");
    return res.json({ logs, result: extracted });

  } catch (err) {
    logAndPrint(logs, `FATAL ERROR: ${err.message}`);
    return res.status(500).json({
      error: err.message,
      logs,
    });

  } finally {
    if (browser) {
      await browser.close();
      logAndPrint(logs, "Browser closed");
    }
  }
});
 
// Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Runner backend listening on port ${PORT}`);
});


