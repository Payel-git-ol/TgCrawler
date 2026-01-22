import { Scraper } from "./srcaper/scraper";
import { PostExtractor } from "./extractor";
import { HtmlParser } from "./parser/htmlParser";
import { TextParser } from "./parser/parser";
import { ContentValidator } from "./validate/validator";

export class ServiceFactory {
  static createScraper(): Scraper {
    const validator = new ContentValidator();
    const parser = new TextParser();
    const htmlParser = new HtmlParser();
    const extractor = new PostExtractor(validator, parser, htmlParser);
    return new Scraper(extractor, htmlParser);
  }
}
