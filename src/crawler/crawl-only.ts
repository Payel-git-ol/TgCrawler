import { chromium } from "playwright";
import { DataStorage, JobPost } from "../storage";
import { CONFIG } from "../config/config";
import { Logger } from "../log/logger";
import { ServiceFactory } from "../services/factory";

async function crawl(): Promise<void> {
  const browser = await chromium.launch();
  const scraper = ServiceFactory.createScraper();
  const storage = new DataStorage(CONFIG.DATA_DIR);

  try {
    Logger.section("Starting Telegram Crawl");

    const existingIds = await storage.getExistingIds();
    const existingContent = await storage.getExistingContent();
    Logger.info(
      `Database: ${existingIds.size} posts, ${existingContent.size} content hashes`
    );

    let totalSaved = 0;
    let totalDuplicates = 0;
    const allSavedPosts: JobPost[] = [];

    for (const url of CONFIG.TELEGRAM_URLS) {
      Logger.info(`\nCrawling: ${url}`);
      const page = await browser.newPage();

      try {
        const allPosts = await scraper.scrape(page, url);

        const newPosts = allPosts.filter((p) => {
          const contentHash = `${p.title}|${p.description}`;
          return !existingIds.has(p.id) && !existingContent.has(contentHash);
        });

        if (newPosts.length === 0) {
          Logger.warn(`  No new posts from ${url}`);
          continue;
        }

        const result = await storage.saveNewJobs(newPosts);

        Logger.success(`  Saved: ${result.saved.length}`);
        Logger.info(`  Duplicates: ${result.skipped}`);

        totalSaved += result.saved.length;
        totalDuplicates += result.skipped;
        allSavedPosts.push(...result.saved);

        // Update existing IDs and content for next channel
        result.saved.forEach((p) => {
          existingIds.add(p.id);
          existingContent.add(`${p.title}|${p.description}`);
        });
      } finally {
        await page.close();
      }
    }

    Logger.section("Final Results");
    Logger.success(`Total Saved: ${totalSaved}`);
    Logger.info(`Total Duplicates: ${totalDuplicates}`);

    if (allSavedPosts.length > 0) {
      Logger.info("Sample:");
      allSavedPosts.slice(0, 5).forEach((post, i) => {
        console.log(`\n${i + 1}. ${post.title}`);
        console.log(`   Channel: ${post.channelUrl || "unknown"}`);
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
