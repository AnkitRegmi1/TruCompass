import * as cheerio from "cheerio";
import { requestText } from "../../lib/http/request.js";

function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim();
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreMatch(query, candidate) {
  const queryTokens = new Set(tokenize(query));

  return tokenize(candidate).reduce(
    (score, token) => score + (queryTokens.has(token) ? 1 : 0),
    0,
  );
}

export class NewsletterService {
  constructor({
    cache,
    cacheTtlMs = 15 * 60 * 1000,
    issueUrl = "https://newsletter.truman.edu/issue.asp?id=4909",
  } = {}) {
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
    this.issueUrl = issueUrl;
  }

  async getIssue({ forceRefresh = false } = {}) {
    const cacheKey = "newsletter:current";
    const cachedPayload = (await this.cache?.read?.()) ?? {};
    const cachedEntry = cachedPayload[cacheKey];
    const cacheIsFresh =
      cachedEntry &&
      Number.isFinite(cachedEntry.fetchedAt) &&
      Date.now() - cachedEntry.fetchedAt < this.cacheTtlMs;

    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedEntry,
        source: "cache",
      };
    }

    const html = await requestText(this.issueUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const $ = cheerio.load(html);
    const title = $("title").first().text().trim();
    const articles = [];

    $("a[href*='article.asp?id=']").each((index, element) => {
      const headline = $(element).text().trim().replace(/\s+/g, " ");
      const href = $(element).attr("href") || "";

      if (!headline) {
        return;
      }

      articles.push({
        title: headline,
        url: href.startsWith("http")
          ? href
          : `https://newsletter.truman.edu/${href.replace(/^\//, "")}`,
      });
    });

    const payload = {
      fetchedAt: Date.now(),
      title,
      issueUrl: this.issueUrl,
      articleCount: articles.length,
      articles,
    };

    if (this.cache?.write) {
      await this.cache.write({
        ...cachedPayload,
        [cacheKey]: payload,
      });
    }

    return {
      ...payload,
      source: "api",
    };
  }

  async respondToQuery(userInput, options = {}) {
    const issue = await this.getIssue(options);
    const rankedArticles = issue.articles
      .map((article) => ({
        article,
        score: scoreMatch(userInput, article.title),
      }))
      .sort((left, right) => right.score - left.score);

    if (rankedArticles[0]?.score > 0) {
      const match = rankedArticles[0].article;

      return {
        issue,
        textResponse: `From the Truman newsletter: ${match.title}. You can read more here: ${match.url}`,
      };
    }

    return {
      issue,
      textResponse: `Here are some current Truman newsletter items: ${issue.articles
        .slice(0, 5)
        .map((article) => article.title)
        .join("; ")}.`,
    };
  }
}
