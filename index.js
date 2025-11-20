import express from "express";
import cors from "cors";
import { chromium } from "playwright";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Runner is alive ✅");
});

app.post("/run", async (req, res) => {
  console.log("🔥 /run endpoint hit");

  const { plan } = req.body;
  console.log("📦 Received plan:", plan);

  if (!plan || !Array.isArray(plan)) {
    console.log("❌ Invalid plan format");
    return res.status(400).json({ error: "Invalid plan format" });
  }

  const logs = [];
  let results = [];
  let browser;

  try {
    logs.push("🚀 Launching Chromium...");
    console.log("🚀 Launching Chromium...");

    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage();

    for (const step of plan) {
      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);
        console.log("🌐 Opening:", step.url);

        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 45000
        });

        await page.waitForTimeout(3000);
      }

      if (step.action === "extract_list") {
        console.log("🔍 Extracting...");

        const extracted = await page.evaluate(() => {
          const items = [];
          document.querySelectorAll(".athing .titleline > a").forEach(a => {
            items.push({ title: a.innerText.trim(), link: a.href });
          });
          return items.slice(0, 30);
        });

        results = extracted;
        logs.push(`✅ Extracted ${results.length} items`);
        console.log(`✅ Extracted ${results.length} items`);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Runner live on port ${PORT}`);
});







