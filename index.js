const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
app.use(cors());
app.use(express.json());

// Health-check endpoint
app.get("/", (req, res) => {
  res.send("AI Web Worker Runner is alive ✅");
});

app.post("/run", async (req, res) => {
  // Accept BOTH:
  // { plan: [...] } OR { commands: [...] }
  const plan = req.body.commands || req.body.plan;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "plan must be an array of steps" });
  }

  let browser;
  const logs = [];
  let extracted = [];

  try {
    logs.push("Launching bundled Chromium...");

    // Puppeteer base image already knows where Chromium is
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

    // Execute plan steps
    for (const step of plan) {
      logs.push(`Executing: ${JSON.stringify(step)}`);

      // 1. Open page
      if (step.action === "open_page") {
        await page.goto(step.url, { waitUntil: "networkidle2" });
        logs.push(`Opened page: ${step.url}`);
      }

      // 2. Click element
      if (step.action === "click") {
        await page.click(step.selector);
        logs.push(`Clicked selector: ${step.selector}`);
      }

      // 3. Type into input
      if (step.action === "type") {
        await page.type(step.selector, step.text);
        logs.push(`Typed into ${step.selector}: ${step.text}`);
      }

      // 4. Wait
      if (step.action === 'wait') {
  const ms = step.seconds * 1000;
  await new Promise(res => setTimeout(res, ms));
  logs.push(`Waited ${step.seconds} seconds`);
}

      // 5. Extract list
      if (step.action === "extract_list") {
        const items = await page.$$eval(step.selector, (elements) =>
          elements.map((el) => ({
            text: el.textContent?.trim() || "",
            href: el.href || null,
          }))
        );

        extracted = items.slice(0, step.limit || 30);
        logs.push(`Extracted ${extracted.length} items`);
      }
    }

    // Send response
    res.json({ logs, result: extracted });

  } catch (err) {
    console.error(err);
    logs.push(`ERROR: ${err.message}`);
    res.status(500).json({ error: err.message, logs });

  } finally {
    if (browser) {
      await browser.close();
      logs.push("Browser closed");
    }
  }
});

// Railway port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Runner backend listening on port ${PORT}`);
});
