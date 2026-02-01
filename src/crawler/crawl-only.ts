import { chromium } from "playwright";
import { DataStorage, JobPost } from "../storage";
import { CONFIG } from "../config/config";
import { Logger } from "../log/logger";
import { ServiceFactory } from "../services/factory";
import { launchBrowser } from "../launchBrowser";
import { TaskService } from "../services/database/task";
import { config } from 'dotenv';

config();

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

  // Initialize database service if DATABASE_URL is available
  let taskService: TaskService | null = null;
  try {
    taskService = new TaskService();
    await taskService.ensureTablesExist();
    const dbCount = await taskService.countTasks();
    Logger.info(`Database connection OK. Current tasks in DB: ${dbCount}`);
  } catch (dbError) {
    Logger.warn(`Database not available, saving to files only: ${dbError}`);
    taskService = null;
  }

  const cutoffDate = sinceDate || new Date(Date.now() - CONFIG.MAX_POST_AGE_DAYS * 24 * 60 * 60 * 1000);

  try {
    Logger.info(`Starting Telegram Crawl (since ${cutoffDate.toISOString().split('T')[0]})`);
    Logger.info(`Looking for posts newer than: ${cutoffDate.toLocaleDateString()}`);

    // Use DB for dedup if available, otherwise fall back to file storage
    let existingIds: Set<string>;
    let existingContent: Set<string>;

    if (taskService) {
      existingIds = await taskService.getExistingPostIds();
      existingContent = await taskService.getExistingContentHashes();
    } else {
      existingIds = await storage.getExistingIds();
      existingContent = await storage.getExistingContent();
    }
    Logger.info(
      `Existing: ${existingIds.size} posts, ${existingContent.size} content hashes`
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
          const contentHash = `${p.title}|${p.description}`.toLowerCase().trim();
          return !existingIds.has(p.id) && !existingContent.has(contentHash);
        });

        if (newPosts.length === 0) {
          Logger.warn(`  No new posts from ${url} (age filtered: ${totalFilteredByAge})`);
          continue;
        }

        // Save to database if available
        let dbSavedCount = 0;
        if (taskService) {
          try {
            const tasksToSave = newPosts.map((post) => ({
              id_post: post.id,
              title: post.title,
              description: post.description,
              workType: post.workType,
              payment: post.payment,
              deadline: post.deadline,
              url: post.url,
              channelUrl: post.channelUrl || "",
              scrapedAt: post.scrapedAt,
              timestamp: post.timestamp || post.scrapedAt,
            }));
            const dbResult = await taskService.createManyTasks(tasksToSave);
            dbSavedCount = dbResult.count;
            Logger.success(`  Saved to DB: ${dbSavedCount}`);
          } catch (dbError) {
            Logger.error(`  Database save failed: ${dbError}`);
          }
        }

        // Also save to files
        const fileResult = await storage.saveNewJobs(newPosts);

        Logger.success(`  Saved to files: ${fileResult.saved.length}`);
        Logger.info(`  Duplicates: ${fileResult.skipped}`);
        Logger.info(`  Filtered by age: ${totalFilteredByAge}`);

        totalSaved += Math.max(dbSavedCount, fileResult.saved.length);
        totalDuplicates += fileResult.skipped;
        allSavedPosts.push(...newPosts);

        // Update existing IDs and content for next channel
        newPosts.forEach((p) => {
          existingIds.add(p.id);
          existingContent.add(`${p.title}|${p.description}`.toLowerCase().trim());
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
    if (taskService) {
      await taskService.disconnect();
    }
    await browser.close();
  }
}

crawl();
