const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

// Simple health-check
app.get('/', (req, res) => {
  res.send('AI Web Worker Runner is alive ✅');
});

app.post('/run', async (req, res) => {
  // Accept BOTH:
  // { plan: [...] } AND { commands: [...] }
  const plan = req.body.commands || req.body.plan;

  if (!plan || !Array.isArray(plan)) {
    return res.status(400).json({ error: 'plan must be an array of steps' });
  }

  let browser;
  const logs = [];
  let extracted = [];

  try {
    logs.push('Launching Chromium...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath: puppeteer.executablePath(),   // 👈 FIX HERE
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    for (const step of plan) {
      logs.push(`Executing: ${JSON.stringify(step)}`);

      if (step.action === 'open_page') {
        await page.goto(step.url, { waitUntil: 'networkidle2' });
        logs.push(`Opened page: ${step.url}`);
      }

      if (step.action === 'click') {
        await page.click(step.selector);
        logs.push(`Clicked selector: ${step.selector}`);
      }

      if (step.action === 'type') {
        await page.type(step.selector, step.text);
        logs.push(`Typed into ${step.selector}: ${step.text}`);
      }

      if (step.action === 'wait') {
        await page.waitForTimeout(step.seconds * 1000);
        logs.push(`Waited ${step.seconds} seconds`);
      }

      if (step.action === 'extract_list') {
        const items = await page.$$eval(step.selector, (elements) =>
          elements.map((el) => ({
            text: el.textContent?.trim() || '',
            href: (el instanceof HTMLAnchorElement && el.href) || null,
          }))
        );

        extracted = items.slice(0, step.limit || 30);
        logs.push(`Extracted ${extracted.length} items`);
      }
    }

    res.json({ logs, result: extracted });

  } catch (err) {
    console.error(err);
    logs.push(`ERROR: ${err.message}`);
    res.status(500).json({ error: err.message, logs });

  } finally {
    if (browser) {
      await browser.close();
      logs.push('Browser closed');
    }
  }
});

// Railway PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Runner backend listening on port ${PORT}`);
});
