import express from "express";
import cors from "cors";
import { chromium } from "playwright";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Runner is alive ✅");
});

app.post("/run", async (req, res) => {
  console.log("🔥 /run endpoint hit");

  const { plan } = req.body;
  const logs = [];
  let browser;

  try {
    // ✅ Verify Chromium exists
    if (!fs.existsSync("/usr/bin/chromium")) {
      throw new Error("System Chromium missing at /usr/bin/chromium");
    }

    logs.push("✅ System Chromium detected");

    browser = await chromium.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await browser.newPage();

    for (const step of plan) {

      if (step.action === "open_page") {
        logs.push(`🌐 Opening ${step.url}`);
        await page.goto(step.url, { waitUntil: "domcontentloaded" });
      }

      if (step.action === "wait") {
        await page.waitForTimeout(step.duration || 2000);
      }

      if (step.action === "extract_list") {
        logs.push("🔍 Extracting...");

        const results = await page.evaluate((limit) => {
          return Array.from(document.querySelectorAll("a"))
            .filter(a => a.innerText.length > 10)
            .slice(0, limit || 30)
            .map(a => ({
              title: a.innerText.trim(),
              link: a.href
            }));
        }, step.limit);

        logs.push(`✅ Extracted ${results.length} items`);
        await browser.close();
        return res.json({ logs, results });
      }
    }

  } catch (err) {
    console.error("❌ FAILURE:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ error: err.message, logs });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Runner live ✅");
});


