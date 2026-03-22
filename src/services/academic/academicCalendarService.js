import * as cheerio from "cheerio";
import { requestText } from "../../lib/http/request.js";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeDateLabel(value) {
  const cleaned = cleanText(value)
    .replace(/,?\s+\d{1,2}(:\d{2})?\s*(a\.m\.|p\.m\.|am|pm)\.?/gi, "")
    .trim();
  const parsed = new Date(cleaned);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export class AcademicCalendarService {
  constructor({
    url = "https://www.truman.edu/majors-programs/academic-resources/academic-calendar-schedules/academic-calendar/2025-26-academic-calendar/",
  } = {}) {
    this.url = url;
  }

  async getEntries() {
    const html = await requestText(this.url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const $ = cheerio.load(html);
    const entries = [];

    $("tr").each((index, element) => {
      const cells = $(element)
        .find("td")
        .map((cellIndex, cell) => cleanText($(cell).text()))
        .get()
        .filter(Boolean);

      if (cells.length < 2) {
        return;
      }

      const [title, label] = cells;
      const date = normalizeDateLabel(label);

      if (!title || !label || !date) {
        return;
      }

      entries.push({
        title,
        label,
        date,
      });
    });

    return {
      url: this.url,
      entries,
    };
  }
}
