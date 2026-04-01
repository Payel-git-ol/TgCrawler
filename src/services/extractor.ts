import { Page } from "playwright";
import { JobPost } from "../storage";
import { ContentValidator } from "./validate/validator";
import { TextParser } from "./parser/parser";
import { HtmlParser, SELECTORS } from "./parser/htmlParser";

export class PostExtractor {
  constructor(
    private validator: ContentValidator,
    private parser: TextParser,
    private htmlParser: HtmlParser
  ) {}

  async extractFromPage(page: Page, baseUrl: string): Promise<JobPost[]> {
    const html = await page.content();
    const $ = this.htmlParser.parseHtml(html);

    return $(SELECTORS.POST_MESSAGE)
      .map((_: number, element: any) => this.parsePost($, element, baseUrl))
      .filter((post: any): post is JobPost => post !== null)
      .toArray();
  }

  private parsePost($: any, element: any, baseUrl: string): JobPost | null {
    try {
      const $el = $(element);
      const postId = this.htmlParser.extractPostId($el);
      const text = this.htmlParser.extractText($el);

      if (!text || text.length < 10) {
        return null;
      }

      const [title, description] = this.parser.splitText(text);

      if (!this.validator.isJobPost(title, description)) {
        return null;
      }

      const postTimestamp = this.htmlParser.extractTimestamp($el);

      return {
        id: postId,
        title,
        description,
        workType: this.parser.extractField(text, "тип работы|type"),
        payment: this.parser.extractField(text, "оплата|payment"),
        deadline: this.parser.extractField(text, "сроки|deadline|срок"),
        url: `${baseUrl.replace('/s/', '/')}/${postId}`,
        channelUrl: baseUrl,
        scrapedAt: new Date().toISOString(),
        timestamp: postTimestamp ? postTimestamp.toISOString() : new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async hasNewPosts(page: Page, lastPostId: string | null): Promise<boolean> {
    if (!lastPostId) return true;

    const html = await page.content();
    const $ = this.htmlParser.parseHtml(html);
    const elements = $(SELECTORS.POST_MESSAGE);

    if (elements.length === 0) {
      return false;
    }

    for (let i = 0; i < elements.length; i++) {
      const postId = this.htmlParser.extractPostId($(elements[i]));
      if (postId === lastPostId) {
        return false;
      }
    }

    return true;
  }
}
