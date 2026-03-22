import { requestJson, requestText } from "../../lib/http/request.js";

function buildApiUrl(baseUrl, path) {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;

  return new URL(normalizedPath, normalizedBaseUrl);
}

export class TrumanApiClient {
  constructor({
    baseUrl,
    onCampusEventsPath,
    athleticsEventsPath,
    feedsPath,
    athleticsHomeUrl = "https://trumanbulldogs.com",
  }) {
    this.baseUrl = baseUrl;
    this.onCampusEventsPath = onCampusEventsPath;
    this.athleticsEventsPath = athleticsEventsPath;
    this.feedsPath = feedsPath;
    this.athleticsHomeUrl = athleticsHomeUrl;
    this.defaultHeaders = {
      Accept: "application/vnd.truman.v1+json, application/hal+json, application/json",
    };
  }

  async getOnCampusEvents() {
    const url = buildApiUrl(this.baseUrl, this.onCampusEventsPath);
    return requestJson(url, {
      headers: this.defaultHeaders,
    });
  }

  async getAthleticsEvents() {
    const url = buildApiUrl(this.baseUrl, this.athleticsEventsPath);
    return requestJson(url, {
      headers: this.defaultHeaders,
    });
  }

  async getAthleticsHomepage() {
    return requestText(this.athleticsHomeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
  }

  async getFeedsList() {
    const url = buildApiUrl(this.baseUrl, this.feedsPath);
    return requestJson(url, {
      headers: this.defaultHeaders,
    });
  }

  async getFeedContent(feedUrl) {
    const normalizedUrl = feedUrl?.replace(/^http:\/\//i, "https://");

    if (!normalizedUrl) {
      throw new Error("Feed URL is required.");
    }

    if (normalizedUrl.includes("/wp-json/posts")) {
      return requestJson(normalizedUrl, {
        headers: {
          Accept: "application/json",
        },
      });
    }

    return requestText(normalizedUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, application/json",
      },
    });
  }
}
