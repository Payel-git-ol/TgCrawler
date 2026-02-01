import { Page } from "playwright";
import { load } from "cheerio";
import { Logger } from "../../log/logger";

export const SELECTORS = {
  POST_MESSAGE: ".tgme_widget_message",
  MESSAGE_TEXT: ".tgme_widget_message_text",
  POST_LINK: "a[href*='/s/']",
  MESSAGE_TIME: "time[datetime]",
  MESSAGE_DATE: ".tgme_widget_message_date",
};

export class HtmlParser {
  extractPostId($el: any): string {
    // Prefer data-post attribute (e.g. "digitaltender/5059")
    const dataPost = $el.attr("data-post") || "";
    if (dataPost) {
      return dataPost.split("/").pop() || dataPost;
    }
    // Fallback: find the date link which contains the post URL
    const dateHref = $el.find(SELECTORS.MESSAGE_DATE + " a").first().attr("href") || "";
    if (dateHref) {
      return dateHref.split("/").pop() || `post_${Date.now()}`;
    }
    return `post_${Date.now()}`;
  }

  extractText($el: any): string {
    let text = $el.find(SELECTORS.MESSAGE_TEXT).text().trim();
    return text || $el.text().trim();
  }

  extractTimestamp($el: any): Date | null {
    try {
      const datetime = $el.find(SELECTORS.MESSAGE_TIME).attr("datetime");
      if (datetime) {
        return new Date(datetime);
      }
      
      const dateText = $el.find(SELECTORS.MESSAGE_DATE).text().trim();
      if (dateText) {
        const now = new Date();
        
        if (dateText.includes('сегодня') || dateText.includes('today')) {
          return new Date(now.setHours(0, 0, 0, 0));
        }
        
        if (dateText.includes('вчера') || dateText.includes('yesterday')) {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          return new Date(yesterday.setHours(0, 0, 0, 0));
        }
        
        const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]) - 1;
          const year = dateMatch[3].length === 2 ? 
            parseInt('20' + dateMatch[3]) : 
            parseInt(dateMatch[3]);
          return new Date(year, month, day);
        }
      }
    } catch (error) {
      Logger.warn(`Could not parse timestamp: ${error}`);
    }
    return null;
  }

  parseHtml(html: string): any {
    return load(html);
  }

  async scrollPage(page: Page, times: number = 3): Promise<void> {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => {
        const w = globalThis as any;
        w.scrollBy(0, w.innerHeight / 2); 
      });
      await page.waitForTimeout(800); 
    }
  }

  async waitForSelector(page: Page, selector: string, timeout: number): Promise<void> {
    await page.waitForSelector(selector, { timeout }).catch(() => {
      Logger.warn(`Selector ${selector} not found within ${timeout}ms`);
    });
  }
}