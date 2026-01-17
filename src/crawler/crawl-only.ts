import { chromium } from "playwright";
import { DataStorage, JobPost } from "../storage";
import { CONFIG } from "../config/config";
import { Logger } from "../log/logger";
import { ServiceFactory } from "../services/factory";

async function crawl(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const scraper = ServiceFactory.createScraper();
  const storage = new DataStorage(CONFIG.DATA_DIR);

  try {
    Logger.section("Starting Telegram Crawl");

    const existingIds = await storage.getExistingIds();
    const existingContent = await storage.getExistingContent();
    Logger.info(
      `Database: ${existingIds.size} posts, ${existingContent.size} content hashes`
    );

    const allPosts = await scraper.scrape(page, CONFIG.TELEGRAM_URL);

    const newPosts = allPosts.filter((p) => {
      const contentHash = `${p.title}|${p.description}`;
      return !existingIds.has(p.id) && !existingContent.has(contentHash);
    });

    if (newPosts.length === 0) {
      Logger.warn("No new posts found");
      await browser.close();
      return;
    }

    const result = await storage.saveNewJobs(newPosts);

    Logger.section("Results");
    Logger.success(`Saved: ${result.saved.length}`);
    Logger.info(`Duplicates: ${result.skipped}`);

    if (result.saved.length > 0) {
      Logger.info("Sample:");
      result.saved.slice(0, 3).forEach((post, i) => {
        console.log(`\n${i + 1}. ${post.title}`);
        console.log(`   Type: ${post.workType}`);
        console.log(`   Payment: ${post.payment}`);
      });
    }
  } catch (error) {
    Logger.error("Crawl failed", error);
  } finally {
    await browser.close();
  }
}

crawl();
