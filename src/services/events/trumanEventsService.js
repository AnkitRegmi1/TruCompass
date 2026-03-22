import {
  buildDisplayTimeRange,
  formatDateTime,
  getDayRange,
  getLocalDateKey,
  getTodayDateKey,
  parseTrumanDateTime,
} from "../../lib/time/timeZone.js";
import { overlapsRange } from "../../lib/time/intervals.js";

const MAIN_EVENT_KEYWORDS =
  /\b(game|festival|week|fair|conference|showcase|celebration|concert|performance|exhibition)\b/i;

function isMainEvent(summary, durationMinutes, isAllDay, isMultiDay) {
  return (
    durationMinutes >= 180 ||
    isAllDay ||
    isMultiDay ||
    MAIN_EVENT_KEYWORDS.test(summary ?? "")
  );
}

function mapEvent(event, timeZone) {
  const startInfo = parseTrumanDateTime(event.DTSTART, timeZone);
  const endInfo = parseTrumanDateTime(event.DTEND, timeZone);
  const durationMinutes = Math.max(
    0,
    Math.round((endInfo.utcDate.getTime() - startInfo.utcDate.getTime()) / 60_000),
  );
  const displayEndDate = startInfo.isAllDay
    ? new Date(endInfo.utcDate.getTime() - 1)
    : endInfo.utcDate;
  const isMultiDay =
    getLocalDateKey(startInfo.utcDate, timeZone) !==
    getLocalDateKey(displayEndDate, timeZone);

  return {
    uid: event.UID,
    startsAt: startInfo.utcDate.toISOString(),
    endsAt: endInfo.utcDate.toISOString(),
    summary: event.SUMMARY,
    location: event.LOCATION,
    unixTimestamp: event.UNIX_TIMESTAMP,
    rawStartsAt: event.DTSTART,
    rawEndsAt: event.DTEND,
    isAllDay: startInfo.isAllDay,
    isMultiDay,
    timeZone,
    localDate: startInfo.localDate,
    durationMinutes,
    displayDate: formatDateTime(startInfo.utcDate, timeZone, {
      dateStyle: "medium",
    }),
    displayTime: buildDisplayTimeRange(
      startInfo.utcDate,
      endInfo.utcDate,
      timeZone,
      startInfo.isAllDay,
    ),
    isMainEvent: isMainEvent(
      event.SUMMARY,
      durationMinutes,
      startInfo.isAllDay,
      isMultiDay,
    ),
  };
}

function mapFeed([feedName, feed]) {
  return {
    key: feedName,
    category: feed?.category ?? "",
    title: feed?.title ?? "",
    url: feed?.url ?? "",
    image: feed?.image ?? "",
  };
}

function parseEmbeddedObjects(html) {
  return [...String(html ?? "").matchAll(/var obj = (\{[\s\S]*?\});/g)].map(
    (match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    },
  ).filter(Boolean);
}

function mapAthleticsHomepageEvent(event, timeZone) {
  const startDate = event?.date_utc
    ? new Date(event.date_utc)
    : event?.date
      ? new Date(event.date)
      : null;
  const endDate = event?.end_date_utc
    ? new Date(event.end_date_utc)
    : event?.end_date
      ? new Date(event.end_date)
      : startDate;

  if (!startDate || Number.isNaN(startDate.getTime())) {
    return null;
  }

  const safeEndDate =
    endDate && !Number.isNaN(endDate.getTime()) ? endDate : startDate;

  return {
    uid: `bulldogs-${event.id}`,
    startsAt: startDate.toISOString(),
    endsAt: safeEndDate.toISOString(),
    summary: `${event?.sport?.title || "Athletics"} vs. ${event?.opponent?.title || "TBD"}`,
    location: event?.location || event?.game_facility?.title || "",
    unixTimestamp: Math.floor(startDate.getTime() / 1000),
    rawStartsAt: event?.date,
    rawEndsAt: event?.end_date,
    isAllDay: false,
    isMultiDay: getLocalDateKey(startDate, timeZone) !== getLocalDateKey(safeEndDate, timeZone),
    timeZone,
    localDate: getLocalDateKey(startDate, timeZone),
    durationMinutes: Math.max(
      0,
      Math.round((safeEndDate.getTime() - startDate.getTime()) / 60_000),
    ),
    displayDate: formatDateTime(startDate, timeZone, {
      dateStyle: "medium",
    }),
    displayTime: event?.time
      ? event.time
      : buildDisplayTimeRange(startDate, safeEndDate, timeZone, false),
    isMainEvent: true,
    sport: event?.sport?.title || "",
    opponent: event?.opponent?.title || "",
    status: event?.status || "",
    scheduleUrl: event?.schedule?.url || "",
    detailsUrl: event?.story?.content_url || event?.story?.url || "",
  };
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxLength = 220) {
  const normalized = stripHtml(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function parseFeedDate(rawDate) {
  if (!rawDate) {
    return null;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapWordPressFeedEntry(feed, entry, timeZone) {
  const publishedAt = parseFeedDate(
    entry?.date_gmt ? `${entry.date_gmt}Z` : entry?.date,
  );

  return {
    id: `${feed.key}:${entry?.id ?? entry?.slug ?? Math.random().toString(36).slice(2)}`,
    sourceType: "feed",
    feedKey: feed.key,
    feedTitle: feed.title,
    category: feed.category,
    title: stripHtml(entry?.title),
    summary: truncateText(entry?.excerpt || entry?.content || entry?.title),
    url: entry?.link || feed.url,
    image: feed.image,
    startsAt: publishedAt?.toISOString() ?? null,
    localDate: publishedAt ? getLocalDateKey(publishedAt, timeZone) : null,
    displayTime: publishedAt
      ? formatDateTime(publishedAt, timeZone, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Date unavailable",
  };
}

function getXmlTagValue(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function parseRssItems(xml) {
  return [...String(xml ?? "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(
    (match) => match[1],
  );
}

function mapRssFeedEntry(feed, itemXml, timeZone, index) {
  const publishedAt = parseFeedDate(getXmlTagValue(itemXml, "pubDate"));

  return {
    id: `${feed.key}:rss:${index}`,
    sourceType: "feed",
    feedKey: feed.key,
    feedTitle: feed.title,
    category: feed.category,
    title: getXmlTagValue(itemXml, "title"),
    summary: truncateText(
      getXmlTagValue(itemXml, "description") || getXmlTagValue(itemXml, "title"),
    ),
    url: getXmlTagValue(itemXml, "link") || feed.url,
    image: feed.image,
    startsAt: publishedAt?.toISOString() ?? null,
    localDate: publishedAt ? getLocalDateKey(publishedAt, timeZone) : null,
    displayTime: publishedAt
      ? formatDateTime(publishedAt, timeZone, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Date unavailable",
  };
}

function isCurrentOrUpcomingFeedEntry(entry, dateKey, timeZone) {
  if (!entry.startsAt) {
    return true;
  }

  return getLocalDateKey(new Date(entry.startsAt), timeZone) >= dateKey;
}

export class TrumanEventsService {
  constructor({
    client,
    cache,
    athleticsCache,
    feedsCache,
    feedUpdatesCache,
    cacheTtlMs,
    defaultTimeZone,
  }) {
    this.client = client;
    this.cache = cache;
    this.athleticsCache = athleticsCache;
    this.feedsCache = feedsCache;
    this.feedUpdatesCache = feedUpdatesCache;
    this.cacheTtlMs = cacheTtlMs;
    this.defaultTimeZone = defaultTimeZone;
  }

  async getOnCampusEvents({ forceRefresh = false, timeZone } = {}) {
    return this.#getCachedEvents({
      cacheKeyLabel: "on-campus",
      cache: this.cache,
      forceRefresh,
      timeZone,
      fetcher: () => this.client.getOnCampusEvents(),
    });
  }

  async getAthleticsEvents({ forceRefresh = false, timeZone } = {}) {
    const payload = await this.#getCachedEvents({
      cacheKeyLabel: "athletics",
      cache: this.athleticsCache ?? this.cache,
      forceRefresh,
      timeZone,
      fetcher: () => this.client.getAthleticsEvents(),
    });

    if (payload.eventCount > 0) {
      return payload;
    }

    return this.getAthleticsHomepageEvents({ forceRefresh, timeZone });
  }

  async getAthleticsHomepageEvents({ forceRefresh = false, timeZone } = {}) {
    return this.#getCachedEvents({
      cacheKeyLabel: "athletics-homepage",
      cache: this.athleticsCache ?? this.cache,
      forceRefresh,
      timeZone,
      fetcher: async () => {
        const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
        const html = await this.client.getAthleticsHomepage();
        const embeddedObjects = parseEmbeddedObjects(html);
        const scoreboard = embeddedObjects.find(
          (object) => object?.type === "events" && /scoreboard/i.test(object?.name),
        );
        const events = (scoreboard?.data ?? [])
          .map((event) => mapAthleticsHomepageEvent(event, resolvedTimeZone))
          .filter(Boolean);

        return {
          _embedded: {
            events: events.map((event) => ({
              UID: event.uid,
              DTSTART: event.startsAt,
              DTEND: event.endsAt,
              SUMMARY: event.summary,
              LOCATION: event.location,
              UNIX_TIMESTAMP: event.unixTimestamp,
              __mapped: event,
            })),
          },
        };
      },
    });
  }

  async #getCachedEvents({
    cacheKeyLabel,
    cache,
    forceRefresh = false,
    timeZone,
    fetcher,
  }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const cachedPayload = await cache.read();
    const cacheIsFresh =
      cachedPayload &&
      Number.isFinite(cachedPayload.fetchedAt) &&
      cachedPayload.type === cacheKeyLabel &&
      cachedPayload.timeZone === resolvedTimeZone &&
      Date.now() - cachedPayload.fetchedAt < this.cacheTtlMs;

    // We reuse recent results first so we do not hammer Truman's API.
    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedPayload,
        source: "cache",
      };
    }

    const apiResponse = await fetcher();
    const events = (apiResponse?._embedded?.events ?? []).map((event) =>
      event?.__mapped ? event.__mapped : mapEvent(event, resolvedTimeZone),
    );

    const payload = {
      fetchedAt: Date.now(),
      type: cacheKeyLabel,
      eventCount: events.length,
      timeZone: resolvedTimeZone,
      events,
    };

    await cache.write(payload);

    return {
      ...payload,
      source: "api",
    };
  }

  async getEventsForDate({ date, timeZone, forceRefresh = false }) {
    return this.#getEventsForDateByType({
      date,
      timeZone,
      forceRefresh,
      loader: (options) => this.getOnCampusEvents(options),
    });
  }

  async getAthleticsEventsForDate({ date, timeZone, forceRefresh = false }) {
    return this.#getEventsForDateByType({
      date,
      timeZone,
      forceRefresh,
      loader: (options) => this.getAthleticsEvents(options),
    });
  }

  async #getEventsForDateByType({ date, timeZone, forceRefresh = false, loader }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const payload = await loader({
      forceRefresh,
      timeZone: resolvedTimeZone,
    });
    const dayRange = getDayRange(date, resolvedTimeZone);
    const events = payload.events.filter((event) =>
      overlapsRange(
        new Date(event.startsAt),
        new Date(event.endsAt),
        dayRange.start,
        dayRange.end,
      ),
    );

    return {
      ...payload,
      date,
      events,
      eventCount: events.length,
      mainEvents: events.filter((event) => event.isMainEvent),
    };
  }

  async getFeedsList({ forceRefresh = false } = {}) {
    const cache = this.feedsCache ?? this.cache;
    const cachedPayload = await cache.read();
    const cacheIsFresh =
      cachedPayload &&
      Number.isFinite(cachedPayload.fetchedAt) &&
      Date.now() - cachedPayload.fetchedAt < this.cacheTtlMs;

    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedPayload,
        source: "cache",
      };
    }

    const apiResponse = await this.client.getFeedsList();
    const feeds = Object.entries(apiResponse ?? {})
      .filter(([key]) => key !== "_links")
      .map(mapFeed);

    const payload = {
      fetchedAt: Date.now(),
      feedCount: feeds.length,
      feeds,
      rawLinks: apiResponse?._links ?? {},
    };

    await cache.write(payload);

    return {
      ...payload,
      source: "api",
    };
  }

  async getFeedUpdates({
    date,
    timeZone,
    forceRefresh = false,
    limit = 18,
  } = {}) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const resolvedDate = date ?? getTodayDateKey(resolvedTimeZone);
    const cache = this.feedUpdatesCache ?? this.feedsCache ?? this.cache;
    const cachedPayload = await cache.read();
    const cacheIsFresh =
      cachedPayload &&
      Number.isFinite(cachedPayload.fetchedAt) &&
      cachedPayload.timeZone === resolvedTimeZone &&
      cachedPayload.date === resolvedDate &&
      Date.now() - cachedPayload.fetchedAt < this.cacheTtlMs;

    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedPayload,
        source: "cache",
      };
    }

    const feedsPayload = await this.getFeedsList({ forceRefresh });
    const candidateFeeds = feedsPayload.feeds.filter((feed) => feed?.url);
    const settledResults = await Promise.allSettled(
      candidateFeeds.map(async (feed) => {
        const content = await this.client.getFeedContent(feed.url);

        if (Array.isArray(content)) {
          return content.map((entry) =>
            mapWordPressFeedEntry(feed, entry, resolvedTimeZone),
          );
        }

        if (typeof content === "string") {
          return parseRssItems(content).map((itemXml, index) =>
            mapRssFeedEntry(feed, itemXml, resolvedTimeZone, index),
          );
        }

        return [];
      }),
    );

    const updates = settledResults
      .filter((result) => result.status === "fulfilled")
      .flatMap((result) => result.value)
      .filter((entry) => entry?.title)
      .filter((entry) =>
        isCurrentOrUpcomingFeedEntry(entry, resolvedDate, resolvedTimeZone),
      )
      .sort((left, right) => {
        if (!left.startsAt && !right.startsAt) {
          return left.title.localeCompare(right.title);
        }

        if (!left.startsAt) {
          return 1;
        }

        if (!right.startsAt) {
          return -1;
        }

        return new Date(left.startsAt) - new Date(right.startsAt);
      })
      .slice(0, limit);

    const payload = {
      fetchedAt: Date.now(),
      date: resolvedDate,
      timeZone: resolvedTimeZone,
      updateCount: updates.length,
      updates,
      feedCount: candidateFeeds.length,
      failedFeedCount: settledResults.filter((result) => result.status === "rejected")
        .length,
    };

    await cache.write(payload);

    return {
      ...payload,
      source: "api",
    };
  }
}
