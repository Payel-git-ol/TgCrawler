export const CONFIG = {
  TELEGRAM_URL: "https://t.me/s/digitaltender",
  DATA_DIR: "./data",
  MAX_CRAWL_ITERATIONS: 10,
  SCROLL_DELAY_MS: 1000,
  PAGE_LOAD_DELAY_MS: 5000,
  WAIT_FOR_SELECTOR_TIMEOUT_MS: 10000,
  MAX_TITLE_LENGTH: 150,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_FIELD_LENGTH: 200,
  PORT: 3000,
} as const;

export const SELECTORS = {
  POST_MESSAGE: ".tgme_widget_message",
  MESSAGE_TEXT: ".tgme_widget_message_text",
  POST_LINK: "a[href*='/s/']",
} as const;
