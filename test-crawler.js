import { chromium } from "playwright";
import { TelegramCrawler } from "./src/crawler/crawler.js";

async function testCrawler() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const crawler = new TelegramCrawler();

  try {
    console.log("Открываем страницу...");
    await page.goto("https://t.me/s/digitaltender", { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    console.log("Извлекаем посты...");
    const posts = await crawler.extractPostsFromPage(page, "https://t.me/s/digitaltender");

    console.log(`Найдено постов: ${posts.length}`);
    if (posts.length > 0) {
      console.log("Первый пост:", posts[0]);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await browser.close();
  }
}

testCrawler();