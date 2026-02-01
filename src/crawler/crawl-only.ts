import { chromium } from "playwright";
import { DataStorage, JobPost } from "../storage";
import { CONFIG } from "../config/config";
import { Logger } from "../log/logger";
import { ServiceFactory } from "../services/factory";
import { launchBrowser } from "../launchBrowser";

async function crawl(): Promise<void> {
  // Parse --date argument (e.g. --date 2025-01-15)
  const dateArgIndex = process.argv.indexOf('--date');
  let sinceDate: Date | undefined;
  if (dateArgIndex !== -1 && process.argv[dateArgIndex + 1]) {
    const parsed = new Date(process.argv[dateArgIndex + 1]);
    if (isNaN(parsed.getTime())) {
      Logger.error(`Invalid date: ${process.argv[dateArgIndex + 1]}. Use ISO format (e.g. 2025-01-15)`);
      process.exit(1);
    }
    sinceDate = parsed;
  }

  const browser = await launchBrowser();
  const scraper = ServiceFactory.createScraper();
  const storage = new DataStorage(CONFIG.DATA_DIR);
  const cutoffDate = sinceDate || new Date(Date.now() - CONFIG.MAX_POST_AGE_DAYS * 24 * 60 * 60 * 1000);

  try {
    Logger.info(`Starting Telegram Crawl (since ${cutoffDate.toISOString().split('T')[0]})`);
    Logger.info(`Looking for posts newer than: ${cutoffDate.toLocaleDateString()}`);

    const existingIds = await storage.getExistingIds();
    const existingContent = await storage.getExistingContent();
    Logger.info(
      `Database: ${existingIds.size} posts, ${existingContent.size} content hashes`
    );

    let totalSaved = 0;
    let totalDuplicates = 0;
    let totalFilteredByAge = 0;
    const allSavedPosts: JobPost[] = [];

    for (const url of CONFIG.TELEGRAM_URLS) {
      Logger.info(`\nCrawling: ${url}`);
      const page = await browser.newPage();

      try {
        const allPosts = await scraper.scrape(page, url, sinceDate);
        
        if (allPosts.length === 0) {
          Logger.warn(`  No posts found from ${url}`);
          continue;
        }

        // Фильтруем по времени и дубликатам
        const newPosts = allPosts.filter((p) => {
          // Проверяем время публикации
          if (p.timestamp) {
            const postDate = new Date(p.timestamp);
            if (postDate < cutoffDate) {
              totalFilteredByAge++;
              return false;
            }
          }
          
          // Проверяем дубликаты
          const contentHash = `${p.title}|${p.description}`;
          return !existingIds.has(p.id) && !existingContent.has(contentHash);
        });

        if (newPosts.length === 0) {
          Logger.warn(`  No new posts from ${url} (age filtered: ${totalFilteredByAge})`);
          continue;
        }

        const result = await storage.saveNewJobs(newPosts);

        Logger.success(`  Saved: ${result.saved.length}`);
        Logger.info(`  Duplicates: ${result.skipped}`);
        Logger.info(`  Filtered by age: ${totalFilteredByAge}`);

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

    Logger.info("Final Results");
    Logger.success(`Total Saved: ${totalSaved}`);
    Logger.info(`Total Duplicates: ${totalDuplicates}`);
    Logger.info(`Total Filtered by Age: ${totalFilteredByAge}`);

    if (allSavedPosts.length > 0) {
      Logger.info("Sample of new jobs:");
      allSavedPosts.slice(0, 5).forEach((post, i) => {
        console.log(`\n${i + 1}. ${post.title}`);
        console.log(`   Channel: ${post.channelUrl || "unknown"}`);
        console.log(`   Date: ${post.timestamp ? new Date(post.timestamp).toLocaleDateString() : "unknown"}`);
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