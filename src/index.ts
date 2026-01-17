import { Hono } from "hono";
import { chromium } from "playwright";
import * as http from "http";

import { TelegramCrawler } from "./crawler/crawler";
import { DataStorage, JobPost } from "./storage";
import { CONFIG } from "./config/config";
import { Logger } from "./log/logger";
import { ServiceFactory } from "./services/factory";

// Utility function to shuffle array (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const app = new Hono();
const storage = new DataStorage(CONFIG.DATA_DIR);
const crawler = new TelegramCrawler();

// Routes

app.get("/", (c) => {
  return c.json({
    name: "Telegram Web Crawler",
    version: "1.0.0",
    endpoints: {
      "GET /api/jobs": "Get all posts from all files",
      "GET /api/files": "List all data files",
      "GET /api/file/:filename": "Get posts from specific file",
      "GET /api/jobs/:id": "Get post by ID",
      "GET /api/jobs/filter/type/:type": "Filter by work type",
      "POST /api/crawl": "Start crawler",
      "GET /api/stats": "Get statistics",
    },
  });
});

app.get("/api/jobs", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();
    const shuffled = shuffleArray(jobs);
    return c.json({ success: true, count: shuffled.length, jobs: shuffled });
  } catch (error) {
    Logger.error("Failed to load jobs", error);
    return c.json({ success: false, error: "Failed to load jobs" }, 500);
  }
});

app.get("/api/files", async (c) => {
  try {
    const files = await storage.listJsonFilesPublic();
    return c.json({ success: true, count: files.length, files });
  } catch (error) {
    Logger.error("Failed to load files list", error);
    return c.json({ success: false, error: "Failed to load files" }, 500);
  }
});

app.get("/api/file/:filename", async (c) => {
  try {
    const filename = c.req.param("filename");
    const jobs = await storage.loadJobs(filename);
    const shuffled = shuffleArray(jobs);
    return c.json({ success: true, filename, count: shuffled.length, jobs: shuffled });
  } catch (error) {
    Logger.error("Failed to load file", error);
    return c.json({ success: false, error: "Failed to load file" }, 500);
  }
});

app.get("/api/jobs/:id", async (c) => {
  try {
    const jobs = await storage.loadJobs();
    const job = jobs.find((j) => j.id === c.req.param("id"));

    if (!job) {
      return c.json({ success: false, error: "Post not found" }, 404);
    }

    return c.json({ success: true, job });
  } catch (error) {
    Logger.error("Failed to load post", error);
    return c.json({ success: false, error: "Failed to load post" }, 500);
  }
});

app.get("/api/jobs/filter/type/:type", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();
    const type = c.req.param("type").toLowerCase();
    const filtered = jobs.filter((j) =>
      j.workType.toLowerCase().includes(type)
    );

    return c.json({ success: true, count: filtered.length, jobs: filtered });
  } catch (error) {
    Logger.error("Failed to filter jobs", error);
    return c.json({ success: false, error: "Failed to filter" }, 500);
  }
});

app.post("/api/crawl", async (c) => {
  const browser = await chromium.launch();
  const scraper = ServiceFactory.createScraper();
  const allCollected: JobPost[] = [];
  let totalDuplicates = 0;

  try {
    Logger.info(`Starting crawl of ${CONFIG.TELEGRAM_URLS.length} channels`);

    const existingIds = await storage.getExistingIds();
    const existingContent = await storage.getExistingContent();
    Logger.info(`Database: ${existingIds.size} posts`);

    for (const url of CONFIG.TELEGRAM_URLS) {
      Logger.info(`Crawling: ${url}`);
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

        Logger.info(`  Saved: ${result.saved.length}, Duplicates: ${result.skipped}`);

        allCollected.push(...result.saved);
        totalDuplicates += result.skipped;

        // Update existing for next channel
        result.saved.forEach((p) => {
          existingIds.add(p.id);
          existingContent.add(`${p.title}|${p.description}`);
        });
      } finally {
        await page.close();
      }
    }

    if (allCollected.length === 0) {
      return c.json({
        success: true,
        message: "No new posts found",
        posts: [],
      });
    }

    return c.json({
      success: true,
      message: `Collected ${allCollected.length} new posts from ${CONFIG.TELEGRAM_URLS.length} channels`,
      posts: allCollected,
    });
  } catch (error) {
    Logger.error("Crawl failed", error);
    return c.json(
      { success: false, error: `Crawl failed: ${String(error)}` },
      500
    );
  } finally {
    await browser.close();
  }
});

app.get("/api/stats", async (c) => {
  try {
    const jobs = await storage.loadAllJobs();

    const stats = {
      totalPosts: jobs.length,
      workTypes: {} as Record<string, number>,
      paymentTypes: {} as Record<string, number>,
    };

    jobs.forEach((job) => {
      stats.workTypes[job.workType] =
        (stats.workTypes[job.workType] || 0) + 1;
      stats.paymentTypes[job.payment] =
        (stats.paymentTypes[job.payment] || 0) + 1;
    });

    return c.json({ success: true, stats });
  } catch (error) {
    Logger.error("Failed to get stats", error);
    return c.json({ success: false, error: "Failed to get stats" }, 500);
  }
});

const PORT = 3000;

// Создаем HTTP сервер с Hono app
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(`http://${req.headers.host}${req.url}`);
    
    let body: any = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      body = Buffer.concat(chunks).toString();
    }

    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
    });

    const response = await app.fetch(request);
    const responseHeaders = Object.fromEntries(response.headers);

    res.writeHead(response.status, responseHeaders);
    const responseBody = await response.arrayBuffer();
    res.end(Buffer.from(responseBody));
  } catch (error) {
    Logger.error("Server error", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
});

server.listen(PORT, () => {
  Logger.success(`Server running on http://localhost:${PORT}`);
});
