import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (_, res) => {
  res.send("Runner is alive ✅");
});

app.post("/run", async (req, res) => {
  console.log("🔥 /run endpoint hit");

  const { plan } = req.body;

  if (!Array.isArray(plan)) {
    return res.status(400).json({ error: "Invalid plan format" });
  }

  const logs = [];
  let results = [];

  try {
    logs.push("🚀 Launching Chromium...");

    const browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage();

    for (const step of plan) {

      if (step.action === "open_page") {
        logs.push(`🌍 Opening ${step.url}`);
        await page.goto(step.url, { waitUntil: "networkidle" });
      }

      if (step.action === "wait") {
        await page.waitForTimeout(step.duration || 2000);
      }

      if (step.action === "extract_list") {
        logs.push("🔎 Extracting list...");

        await page.waitForSelector("a");

        results = await page.evaluate((limit) => {
          return [...document.querySelectorAll("a")]
            .filter(a => a.innerText && a.innerText.length > 20)
            .slice(0, limit || 30)
            .map(a => ({
              title: a.innerText.trim(),
              link: a.href
            }));
        }, step.limit);
      }
    }

    await browser.close();

    res.json({
      logs: [...logs, `✅ Extracted ${results.length} items`],
      results
    });

  } catch (err) {
    console.error("❌ FAILURE:", err);
    res.status(500).json({ error: err.message, logs });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Runner live on port ${PORT}`));
