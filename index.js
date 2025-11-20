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

  try {
    logs.push("🚀 Launching hardened Chromium...");

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ]
    });

    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });

    for (const step of plan) {
      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);
        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });
        await page.waitForTimeout(2000);
      }

      if (step.action === "extract_list") {
        logs.push("🔍 Extracting content...");

        const extracted = await page.evaluate((limit) => {
          const items = [];

          document.querySelectorAll(".athing .titleline > a").forEach(a => {
            items.push({
              title: a.innerText.trim(),
              link: a.href
            });
          });

          if (items.length === 0) {
            document.querySelectorAll("a").forEach(a => {
              if (a.innerText.trim().length > 20) {
                items.push({
                  title: a.innerText.trim(),
                  link: a.href
                });
              }
            });
          }

          return items.slice(0, limit || 30);
        }, step.limit);

        results = extracted;
        logs.push(`✅ Extracted ${results.length} items`);
      }
    }

    await browser.close();

    res.json({ logs, results });

  } catch (error) {
    logs.push("❌ Runtime error: " + error.message);
    res.status(500).json({ error: error.message, logs });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("Runner live on port", PORT));







