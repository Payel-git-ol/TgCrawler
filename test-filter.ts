import { chromium } from "playwright";
import { load } from "cheerio";
import { ContentValidator } from "./src/services/validate/validator";

const SELECTORS = {
  POST_MESSAGE: ".tgme_widget_message",
  MESSAGE_TEXT: ".tgme_widget_message_text",
};

async function checkFilter() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const url = "https://t.me/s/freelance_dev_work";
  console.log(`\nTesting with ContentValidator: ${url}\n`);
  
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  const $ = load(html);
  const validator = new ContentValidator();
  
  const posts = $(SELECTORS.POST_MESSAGE).slice(0, 5);
  console.log(`Checking first 5 posts:\n`);
  
  posts.each((i, element) => {
    const $el = $(element);
    
    // Try to extract text like the extractor does
    let text = "";
    const textEl = $el.find(SELECTORS.MESSAGE_TEXT);
    if (textEl.length > 0) {
      text = textEl.text();
    } else {
      text = $el.text();
    }
    
    // Split like the parser does
    const lines = text.split("\n").filter(l => l.trim());
    const title = (lines[0] || "").substring(0, 150);
    const description = text.substring(0, 1000);
    
    const hasJobEmoji = title.includes("👔") || title.includes("💼") || title.includes("📌");
    const hasJobKeyword = validator.hasJobKeyword(text);
    const isAdv = validator.isAdvertisement(text);
    const isJobPost = validator.isJobPost(title, description);
    
    console.log(`Post ${i + 1}:`);
    console.log(`  Title: "${title.substring(0, 60)}..."`);
    console.log(`  Has job emoji: ${hasJobEmoji}`);
    console.log(`  Has job keyword: ${hasJobKeyword}`);
    console.log(`  Is advertisement: ${isAdv}`);
    console.log(`  Is job post: ${isJobPost}`);
    console.log("");
  });
  
  await browser.close();
}

checkFilter().catch(console.error);
