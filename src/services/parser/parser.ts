import { CONFIG } from "../../config/config";

export class TextParser {
  splitText(text: string): [string, string] {
    const lines = text.split("\n").filter((l) => l.trim());
    const title = lines[0]?.substring(0, CONFIG.MAX_TITLE_LENGTH) || "";
    const description = text.substring(0, CONFIG.MAX_DESCRIPTION_LENGTH);
    return [title, description];
  }

  extractField(text: string, patterns: string): string {
    const patternList = patterns.split("|");
    const lines = text.split("\n");

    for (const pattern of patternList) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes(pattern.toLowerCase())) {
          let value = lines[i].replace(new RegExp(pattern, "i"), "").trim();
          if (!value && i + 1 < lines.length) {
            value = lines[i + 1].trim();
          }
          if (value) {
            return value.substring(0, CONFIG.MAX_FIELD_LENGTH);
          }
        }
      }
    }

    return "";
  }
}
