import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/run", async (req, res) => {
  const { plan } = req.body;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "Invalid plan format" });
  }

  const logs = [];
  let results = [];

  let browser;

  try {
    logs.push("🚀 Launching hardened Chromium...");

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
        "--disable-software-rasterizer"
      ]
    });

    const page = await browser.newPage();

    for (const step of plan) {
      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);

        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });

        await page.waitForTimeout(3000);
      }

      if (step.action === "extract_list") {
        logs.push("🔍 Extracting content...");

        const extracted = await page.evaluate(() => {
          const items = [];

          document.querySelectorAll(".athing .titleline > a").forEach(a => {
            items.push({
              title: a.innerText.trim(),
              link: a.href
            });
          });

          if (items.length === 0) {
            document.querySelectorAll("a").forEach(a => {
              const text = a.innerText.trim();
              if (text.length > 25) {
                items.push({
                  title: text,
                  link: a.href
                });
              }
            });
          }

          return items.slice(0, 30);
        });

        results = extracted;
        logs.push(`✅ Extracted ${results.length} items`);
      }
    }

    await browser.close();

    res.json({ logs, results });

  } catch (error) {
    logs.push("❌ Runtime error: " + error.message);
    if (browser) await browser.close();
    res.status(500).json({ error: error.message, logs });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("Runner live on port", PORT));







