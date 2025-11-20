import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/", (req, res) => {
  res.send("Runner is alive ✅");
});

app.post("/run", async (req, res) => {
  console.log("🔥 /run endpoint hit");

  const { plan } = req.body;
  console.log("📦 Received plan:", plan);

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "Invalid plan format" });
  }

  const logs = [];
  let results = [];
  let browser;

  try {
    logs.push("🚀 Launching Chromium...");
    console.log("🚀 Launching Chromium...");

    // ✅ FORCE SYSTEM CHROMIUM (THIS IS THE FIX)
    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    });

    const page = await context.newPage();

    for (const step of plan) {

      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);
        console.log("🌐 Opening:", step.url);

        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });

        await page.waitForTimeout(2000);
      }

      if (step.action === "extract_list") {
        logs.push("🔍 Extracting list...");
        console.log("🔍 Extracting list...");

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
              const text = a.innerText.trim();
              if (text.length > 25) {
                items.push({
                  title: text,
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

  } catch (err) {
    console.error("❌ FAILURE:", err);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message, logs });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Runner live on port ${PORT}`);
});









