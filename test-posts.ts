import { chromium } from "playwright";
import { load } from "cheerio";

async function checkPosts() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const url = "https://t.me/s/freelance_dev_work";
  console.log(`\nTesting posts extraction: ${url}\n`);
  
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  
  const html = await page.content();
  const $ = load(html);
  
  const posts = $(".tgme_widget_message").slice(0, 5);
  console.log(`Found ${$(".tgme_widget_message").length} posts total\n`);
  console.log(`Checking first 5:\n`);
  
  posts.each((i, element) => {
    const $el = $(element);
    
    // Get post ID
    const dataPost = $el.attr("data-post");
    const postId = dataPost?.split("/")[1] || "unknown";
    
    // Get text - try different selectors
    let text = "";
    
    // Try different text selectors
    const textEl = $el.find(".tgme_widget_message_text");
    if (textEl.length > 0) {
      text = textEl.text().substring(0, 100);
    } else {
      text = $el.text().substring(0, 100);
    }
    
    console.log(`Post ${i + 1} (ID: ${postId}):`);
    console.log(`  Text: ${text || "(empty)"}`);
    console.log(`  Classes: ${$el.attr("class")}`);
    console.log("");
  });
  
  await browser.close();
}

checkPosts().catch(console.error);
