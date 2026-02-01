import { chromium } from "playwright";
import fs from "fs";

export async function launchBrowser() {
  const chromiumPaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/local/bin/chromium',
    process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ].filter(Boolean);
  
  let executablePath = null;
  for (const path of chromiumPaths) {
    if (path && fs.existsSync(path)) {
      console.log(`Found chromium at: ${path}`);
      executablePath = path;
      break;
    }
  }
  
  if (!executablePath) {
    throw new Error(`Chromium not found. Checked paths: ${chromiumPaths.join(', ')}`);
  }
  
  return await chromium.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer'
    ],
    headless: true
  });
}
