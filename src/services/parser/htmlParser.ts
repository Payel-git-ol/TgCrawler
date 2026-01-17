import { Page } from "playwright";
import { load } from "cheerio";

export const SELECTORS = {
  POST_MESSAGE: ".tgme_widget_message",
  MESSAGE_TEXT: ".tgme_widget_message_text",
  POST_LINK: "a[href*='/s/']",
};

export class HtmlParser {
  extractPostId($el: any): string {
    const href = $el.find(SELECTORS.POST_LINK).first().attr("href") || "";
    return href.split("/").pop() || `post_${Date.now()}`;
  }

  extractText($el: any): string {
    let text = $el.find(SELECTORS.MESSAGE_TEXT).text().trim();
    return text || $el.text().trim();
  }

  parseHtml(html: string): any {
    return load(html);
  }

  async scrollPage(page: Page, times: number = 3): Promise<void> {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => {
        const w = globalThis as any;
        w.scrollBy(0, w.innerHeight);
      });
      await page.waitForTimeout(1000);
    }
  }

  async waitForSelector(page: Page, selector: string, timeout: number): Promise<void> {
    await page.waitForSelector(selector, { timeout }).catch(() => {
      // Timeout is acceptable
    });
  }
}
