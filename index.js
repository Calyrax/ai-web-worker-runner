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
  const { plan } = req.body;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: "Invalid plan format" });
  }

  const logs = [];
  let results = [];
  let browser;

  try {
    logs.push("🚀 Launching Chromium...");

    browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu"
  ]
});


    const page = await browser.newPage();

    for (const step of plan) {

      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);
        await page.goto(step.url, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
      }

      if (step.action === "wait") {
        await page.waitForTimeout(step.duration || 2000);
      }

      if (step.action === "extract_list") {
        logs.push("🔍 Extracting list...");

        await page.waitForSelector("a", { timeout: 15000 });

        const extracted = await page.evaluate((limit) => {
          const items = [];
          document.querySelectorAll("a").forEach(a => {
            const text = a.innerText?.trim();
            if (text && text.length > 15) {
              items.push({
                title: text,
                link: a.href
              });
            }
          });
          return items.slice(0, limit || 30);
        }, step.limit);

        results = extracted;
        logs.push(`✅ Extracted ${results.length} items`);
      }
    }

    await browser.close();
    res.json({ logs, results });

  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ error: err.message, logs });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Runner live on port ${PORT}`));

