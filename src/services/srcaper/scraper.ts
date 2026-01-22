import { Page } from "playwright";
import { PostExtractor } from "../extractor";
import { HtmlParser } from "../parser/htmlParser";
import { CONFIG } from "../../config/config";
import { Logger } from "../../log/logger";

export class Scraper {
  constructor(private extractor: PostExtractor, private htmlParser: HtmlParser) {}

  async scrape(page: Page, url: string): Promise<any[]> {
    Logger.info(`Starting page load: ${url}`);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(CONFIG.PAGE_LOAD_DELAY_MS);

    await this.htmlParser.waitForSelector(
      page,
      ".tgme_widget_message",
      CONFIG.WAIT_FOR_SELECTOR_TIMEOUT_MS
    );

    const allPosts = [];
    let lastPostId: string | null = null;
    let foundOldPosts = false;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    for (let i = 0; i < CONFIG.MAX_CRAWL_ITERATIONS && !foundOldPosts; i++) {
      const posts = await this.extractor.extractFromPage(page, url);

      Logger.info(`Iteration ${i + 1}: Found ${posts.length} posts`);

      if (posts.length === 0) {
        if (allPosts.length > 0) {
          Logger.info("No more posts, stopping");
        }
        break;
      }

      const recentPosts = posts.filter(post => {
        if (!post.timestamp) return true; 
        
        const postDate = new Date(post.timestamp);
        return postDate >= oneWeekAgo;
      });

      if (recentPosts.length === 0) {
        Logger.info("Reached posts older than 1 week, stopping");
        foundOldPosts = true;
        break;
      }

      allPosts.push(...recentPosts);

      if (recentPosts.length < posts.length) {
        Logger.info("Reached posts older than 1 week, stopping");
        foundOldPosts = true;
        break;
      }

      const hasNew = await this.extractor.hasNewPosts(page, lastPostId);
      if (!hasNew) {
        Logger.info("Reached the end, stopping");
        break;
      }

      lastPostId = posts[posts.length - 1]?.id || null;
      
      await this.htmlParser.scrollPage(page, 2);
    }

    Logger.success(`Collected ${allPosts.length} posts from the last week`);
    return allPosts;
  }
}