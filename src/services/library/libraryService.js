import * as cheerio from "cheerio";
import { requestText } from "../../lib/http/request.js";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export class LibraryService {
  constructor({
    url = "https://library.truman.edu/",
  } = {}) {
    this.url = url;
  }

  async getTodaySnapshot() {
    const html = await requestText(this.url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const $ = cheerio.load(html);
    const pageText = cleanText($("body").text());
    const match = pageText.match(/Library Hours:\s*([0-9:apm\s-]+)/i);

    return {
      url: this.url,
      hours: match?.[1]?.trim() || "Hours not found",
    };
  }
}
