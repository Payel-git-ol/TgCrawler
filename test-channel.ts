import { chromium } from "playwright";

async function checkChannel() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const url = "https://t.me/s/freelance_dev_work";
  console.log(`\nTesting: ${url}\n`);
  
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  
  // Check various selectors
  const selectors = [
    ".tgme_widget_message",
    ".tgme_widget_message_bubble",
    ".tgme_msg_bubble",
    "[data-post-id]",
    ".message",
    "article",
    ".tgme_widget_message_text",
  ];
  
  for (const selector of selectors) {
    const count = await page.locator(selector).count();
    console.log(`${selector}: ${count} elements`);
  }
  
  // Check if page loaded correctly
  console.log(`\nHTML length: ${html.length}`);
  console.log(`Contains 'tgme': ${html.includes('tgme')}`);
  console.log(`Contains 'widget': ${html.includes('widget')}`);
  
  // Print first occurrence of post-like content
  const msgIdx = html.indexOf("tgme_widget_message");
  if (msgIdx > -1) {
    console.log(`\nFirst post element at position: ${msgIdx}`);
    console.log(html.substring(msgIdx, msgIdx + 500));
  } else {
    console.log("\nNo 'tgme_widget_message' found, showing first 1000 chars:");
    console.log(html.substring(0, 1000));
  }
  
  await browser.close();
}

checkChannel().catch(console.error);
