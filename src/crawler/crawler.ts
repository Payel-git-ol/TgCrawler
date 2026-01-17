import { ServiceFactory } from "../services/factory";

export class TelegramCrawler {
  private scraper = ServiceFactory.createScraper();

  get services() {
    return { scraper: this.scraper };
  }
}
