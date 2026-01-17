const AD_PATTERNS = [
  /^\[?реклама\]?/i,
  /^sponsored/i,
  /^рассыли/i,
  /pinned/i,
];

const SPAM_KEYWORDS = ["спам", "реклама", "pinned", "закреплено"];

const JOB_KEYWORDS = [
  "вакансия",
  "работа",
  "соискатель",
  "специалист",
  "менеджер",
  "помощь",
  "услуга",
  "разработка",
  "сбор",
  "написание",
  "кампания",
  "тип работы",
  "оплата",
  "опыт",
  "зарплата",
  "требуются",
  "ищу",
  "ищем",
];

const JOB_EMOJIS = ["👔", "💼", "📌"];

export class ContentValidator {
  isSpamPattern(text: string): boolean {
    return AD_PATTERNS.some((pattern) => pattern.test(text));
  }

  hasSpamKeyword(text: string): boolean {
    return SPAM_KEYWORDS.some((keyword) => text.startsWith(keyword));
  }

  hasJobKeyword(text: string): boolean {
    return JOB_KEYWORDS.some((keyword) => text.includes(keyword));
  }

  hasJobEmoji(title: string): boolean {
    return JOB_EMOJIS.some((emoji) => title.includes(emoji));
  }

  isAdvertisement(text: string): boolean {
    const clean = text.toLowerCase().trim();
    return this.isSpamPattern(clean) || this.hasSpamKeyword(clean);
  }

  isJobPost(title: string, description: string): boolean {
    const combined = `${title} ${description}`.toLowerCase();

    if (this.isAdvertisement(combined)) {
      return false;
    }

    // Check for job emoji in both title and description start
    const hasJobEmoji = this.hasJobEmoji(title) || 
                       (title + description).substring(0, 200).includes("📌") ||
                       (title + description).substring(0, 200).includes("👔") ||
                       (title + description).substring(0, 200).includes("💼");

    return this.hasJobKeyword(combined) && hasJobEmoji;
  }
}
