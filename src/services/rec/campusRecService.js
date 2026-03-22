import * as cheerio from "cheerio";
import { requestJson, requestText } from "../../lib/http/request.js";
import { zonedTimeToUtc } from "../../lib/time/timeZone.js";

const DEFAULT_HISTORY_LIMIT = 2_500;
const HOUR_IN_MS = 60 * 60 * 1000;

function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim();
}

function parseTimeToMinutes(label) {
  const match = String(label ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toLowerCase();

  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
}

function getCurrentMinutes(timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isToday(date, timeZone) {
  if (!date) {
    return true;
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return date === today;
}

function getRecHoursStatus(hoursLabel, date, timeZone) {
  const match = String(hoursLabel ?? "")
    .trim()
    .match(/^(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)$/i);

  if (!match) {
    return null;
  }

  const openMinutes = parseTimeToMinutes(match[1]);
  const closeMinutes = parseTimeToMinutes(match[2]);

  if (openMinutes == null || closeMinutes == null || !isToday(date, timeZone)) {
    return {
      openLabel: match[1],
      closeLabel: match[2],
      isToday: false,
    };
  }

  const nowMinutes = getCurrentMinutes(timeZone);

  return {
    openLabel: match[1],
    closeLabel: match[2],
    openMinutes,
    closeMinutes,
    nowMinutes,
    isOpenNow: nowMinutes >= openMinutes && nowMinutes < closeMinutes,
    opensLaterToday: nowMinutes < openMinutes,
    closedForToday: nowMinutes >= closeMinutes,
    isToday: true,
  };
}

function extractLiveCount(liveOccupancy) {
  if (liveOccupancy?.seriesByPlace) {
    return Object.values(liveOccupancy.seriesByPlace).reduce((total, series) => {
      const value = Array.isArray(series) ? Number(series[series.length - 1] ?? 0) : 0;
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  return (
    liveOccupancy?.currentCount ??
    liveOccupancy?.count ??
    liveOccupancy?.occupancy ??
    liveOccupancy?.liveCount ??
    liveOccupancy?.current ??
    null
  );
}

function extractPlaceCounts(liveOccupancy) {
  if (liveOccupancy?.seriesByPlace) {
    return Object.fromEntries(
      Object.entries(liveOccupancy.seriesByPlace).map(([place, series]) => {
        const value = Array.isArray(series) ? Number(series[series.length - 1] ?? 0) : 0;
        return [place, Number.isFinite(value) ? value : 0];
      }),
    );
  }

  return {};
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreMatch(query, candidate) {
  const queryTokens = new Set(tokenize(query));
  const candidateTokens = tokenize(candidate);

  return candidateTokens.reduce(
    (score, token) => score + (queryTokens.has(token) ? 1 : 0),
    0,
  );
}

function parseEventText(detailText, date) {
  const normalized = String(detailText ?? "").trim();
  const timeMatch = normalized.match(/-\s*([0-9]{1,2}:[0-9]{2}\s*[ap]m)/i);
  const timeLabel = timeMatch ? timeMatch[1] : "";
  const isoRange = timeLabel ? buildIsoRange(date, timeLabel) : {};

  return {
    time: timeLabel,
    startsAt: isoRange.startsAt ?? null,
    endsAt: isoRange.endsAt ?? null,
  };
}

function buildIsoRange(dateKey, timeLabel) {
  const match = String(timeLabel ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);

  if (!dateKey || !match) {
    return {};
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3].toLowerCase();

  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const start = zonedTimeToUtc(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
    },
    "America/Chicago",
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

function formatLongDate(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(`${dateString}T12:00:00`));
}

function buildEventLine(event) {
  return `${event.title}${event.time ? ` at ${event.time}` : ""}`;
}

function buildEventsSummary(events) {
  return events.map(buildEventLine).join("; ");
}

function isUpcomingOrCurrentRecEvent(event, date, timeZone) {
  if (!event?.endsAt || !isToday(date, timeZone)) {
    return true;
  }

  return new Date(event.endsAt).getTime() >= Date.now();
}

function getWeekdayAndHour(isoString, timeZone = "America/Chicago") {
  const date = new Date(isoString);

  return {
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(date),
    hour: Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hour12: false,
      }).format(date),
    ),
  };
}

function getAllowedHours(preferredRecTime) {
  const preference = normalizeText(preferredRecTime);

  if (preference.includes("morning")) {
    return new Set([6, 7, 8, 9, 10, 11]);
  }

  if (preference.includes("afternoon")) {
    return new Set([12, 13, 14, 15, 16]);
  }

  if (preference.includes("evening")) {
    return new Set([17, 18, 19, 20, 21]);
  }

  if (preference.includes("after class")) {
    return new Set([15, 16, 17, 18, 19, 20]);
  }

  return null;
}

function pickCrowdSorter(preferredRecCrowd) {
  const preference = normalizeText(preferredRecCrowd);

  if (/\b(quiet|calm|less|fewer|empty|not busy)\b/.test(preference)) {
    return (left, right) => left.averagePeople - right.averagePeople;
  }

  if (/\b(busy|lively|more|crowded|energy)\b/.test(preference)) {
    return (left, right) => right.averagePeople - left.averagePeople;
  }

  return (left, right) =>
    Math.abs(left.averagePeople - 25) - Math.abs(right.averagePeople - 25);
}

function hourToLabel(hour) {
  const normalized = hour % 24;
  const suffix = normalized >= 12 ? "PM" : "AM";
  const displayHour = normalized % 12 || 12;
  const nextHour = (normalized + 1) % 24;
  const nextSuffix = nextHour >= 12 ? "PM" : "AM";
  const nextDisplayHour = nextHour % 12 || 12;
  return `${displayHour}:00 ${suffix} - ${nextDisplayHour}:00 ${nextSuffix}`;
}

function buildIsoWindow(dateKey, hour) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = zonedTimeToUtc(
    {
      year,
      month,
      day,
      hour,
      minute: 0,
      second: 0,
    },
    "America/Chicago",
  );
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

function fitsFreeBlocks(startsAt, endsAt, freeBlocks = []) {
  return freeBlocks.some(
    (block) =>
      new Date(startsAt) >= new Date(block.startsAt) &&
      new Date(endsAt) <= new Date(block.endsAt),
  );
}

export function handleRecQuery(userInput, recData, { date, timeZone = "America/Chicago" } = {}) {
  const text = normalizeText(userInput);
  const asksForList =
    /\b(other|another|more|all|any|list)\b/.test(text) ||
    (/\b(classes|events)\b/.test(text) &&
      !/\b(glowga|pilates|dance|fitness|yoga|josie|janes|jack|emily|brynna|gracie)\b/.test(
        text,
      ));

  const hoursIntent =
    /\b(hours|hour|close|closing|open|opening|time|when)\b/.test(text);
  const eventsIntent =
    /\b(events|event|classes|class|yoga|happening|schedule|today at the rec)\b/.test(
      text,
    );
  const occupancyIntent =
    /\b(people|busy|crowded|crowd|count|capacity|occupancy|full|gym|rec right now)\b/.test(
      text,
    );
  const anyEventKeywordIntent =
    eventsIntent ||
    /\b(glowga|pilates|dance|fitness|josie|janes|event|events|class|classes|other|another|more)\b/.test(
      text,
    );

  const responseParts = [];

  if (hoursIntent) {
    if (!recData?.hours || recData.hours === "Hours not found") {
      responseParts.push("I couldn't find today's Campus Rec hours right now.");
    } else {
      const status = getRecHoursStatus(recData.hours, date, timeZone);

      if (status?.isToday && status.isOpenNow) {
        responseParts.push(
          `The Campus Rec Center is open right now. Today's hours are ${status.openLabel} to ${status.closeLabel}.`,
        );
      } else if (status?.isToday && status.opensLaterToday) {
        responseParts.push(
          `The Campus Rec Center is currently closed. It opens at ${status.openLabel} and closes at ${status.closeLabel} today.`,
        );
      } else if (status?.isToday && status.closedForToday) {
        responseParts.push(
          `The Campus Rec Center is currently closed. It was open from ${status.openLabel} to ${status.closeLabel} today.`,
        );
      } else {
        responseParts.push(`The Campus Rec Center hours for today are ${recData.hours}.`);
      }
    }
  }

  if (anyEventKeywordIntent) {
    const events = Array.isArray(recData?.events) ? recData.events : [];
    const actionableEvents = events.filter((event) =>
      isUpcomingOrCurrentRecEvent(event, date, timeZone),
    );
    const rankedEvents = events
      .map((event) => ({
        event,
        score: scoreMatch(text, `${event.title} ${event.details}`),
      }))
      .sort((left, right) => right.score - left.score);

    if (!events.length) {
      responseParts.push(
        "There don't appear to be any Campus Rec classes or special events listed for today.",
      );
    } else if (asksForList) {
      responseParts.push(
        `Here are the Campus Rec classes and events I found today: ${buildEventsSummary(events)}.${actionableEvents.length ? " If you want, I can help add one of the upcoming ones to your schedule." : ""}`,
      );
    } else if (rankedEvents[0]?.score > 0) {
      const match = rankedEvents[0].event;
      const canStillSchedule = isUpcomingOrCurrentRecEvent(match, date, timeZone);
      responseParts.push(
        `${match.title}${match.time ? ` is at ${match.time}` : ""}. ${match.details ? `Details: ${match.details}.` : ""}${canStillSchedule ? " If you want, I can help add it to your schedule." : ""}`,
      );
    } else {
      responseParts.push(
        `Here's what's happening at the Campus Rec Center today: ${buildEventsSummary(events)}.${actionableEvents.length ? " If you want, I can help add one of the upcoming ones to your schedule." : ""}`,
      );
    }
  }

  if (occupancyIntent) {
    const count = extractLiveCount(recData?.liveOccupancy);

    if (recData?.liveOccupancy == null) {
      responseParts.push("I couldn't get the live Campus Rec occupancy right now.");
    } else if (count == null) {
      responseParts.push(
        "I found the live Campus Rec data, but I couldn't read the current count.",
      );
    } else if (count === 0) {
      responseParts.push(
        "The Campus Rec Center is currently at 0 people, so it looks empty right now.",
      );
    } else if (count < 25) {
      responseParts.push(
        `There are ${count} people at the Campus Rec Center right now, so it looks pretty calm.`,
      );
    } else if (count < 60) {
      responseParts.push(
        `There are ${count} people at the Campus Rec Center right now. It looks moderately busy.`,
      );
    } else {
      responseParts.push(
        `There are ${count} people at the Campus Rec Center right now, so it's pretty busy.`,
      );
    }
  }

  if (responseParts.length) {
    return responseParts.join(" ");
  }

  return "I can help with Campus Rec hours, today's events and classes, or the live occupancy. What would you like to know?";
}

export class CampusRecService {
  constructor({
    liveCounterUrl = "https://rec-live-counter.vercel.app/api/hourly_breakdown",
    websiteUrl = "https://recreation.truman.edu/",
    historyCache = null,
  } = {}) {
    this.liveCounterUrl = liveCounterUrl;
    this.websiteUrl = websiteUrl;
    this.historyCache = historyCache;
  }

  async #recordHistorySnapshot(liveData) {
    if (!this.historyCache || !liveData) {
      return;
    }

    const payload = (await this.historyCache.read()) ?? { snapshots: [] };
    const timestamp =
      liveData.last_updated_utc || new Date().toISOString();
    const snapshot = {
      timestamp,
      totalCount: extractLiveCount(liveData) ?? 0,
      byPlace: extractPlaceCounts(liveData),
    };

    const filtered = (payload.snapshots ?? []).filter(
      (entry) => entry.timestamp !== timestamp,
    );

    filtered.push(snapshot);
    filtered.sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));

    await this.historyCache.write({
      snapshots: filtered.slice(-DEFAULT_HISTORY_LIMIT),
    });
  }

  async collectLiveSnapshot() {
    const liveData = await requestJson(this.liveCounterUrl);
    await this.#recordHistorySnapshot(liveData);
    return liveData;
  }

  startHourlyHistoryCollection({
    intervalMs = HOUR_IN_MS,
    runImmediately = true,
  } = {}) {
    const collect = async () => {
      try {
        await this.collectLiveSnapshot();
      } catch (error) {
        console.error("Failed to collect hourly Campus Rec snapshot:", error.message);
      }
    };

    if (runImmediately) {
      void collect();
    }

    const timer = setInterval(() => {
      void collect();
    }, intervalMs);

    if (typeof timer.unref === "function") {
      timer.unref();
    }

    return timer;
  }

  async getCrowdWindowSuggestions({
    date,
    freeBlocks = [],
    preferredRecCrowd = "",
    preferredRecTime = "",
    timeZone = "America/Chicago",
    limit = 2,
  } = {}) {
    if (!this.historyCache || !date) {
      return [];
    }

    const payload = (await this.historyCache.read()) ?? { snapshots: [] };
    const snapshots = payload.snapshots ?? [];

    if (!snapshots.length) {
      return [];
    }

    const targetWeekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(new Date(`${date}T12:00:00`));
    const allowedHours = getAllowedHours(preferredRecTime);
    const buckets = new Map();

    for (const snapshot of snapshots) {
      const { weekday, hour } = getWeekdayAndHour(snapshot.timestamp, timeZone);

      if (weekday !== targetWeekday) {
        continue;
      }

      if (allowedHours && !allowedHours.has(hour)) {
        continue;
      }

      const bucket = buckets.get(hour) ?? {
        hour,
        totalPeople: 0,
        sampleCount: 0,
      };
      bucket.totalPeople += Number(snapshot.totalCount ?? 0);
      bucket.sampleCount += 1;
      buckets.set(hour, bucket);
    }

    const ranked = [...buckets.values()]
      .map((bucket) => ({
        ...bucket,
        averagePeople: Math.round(bucket.totalPeople / bucket.sampleCount),
      }))
      .sort(pickCrowdSorter(preferredRecCrowd));

    const suggestions = [];

    for (const bucket of ranked) {
      const window = buildIsoWindow(date, bucket.hour);

      if (freeBlocks.length && !fitsFreeBlocks(window.startsAt, window.endsAt, freeBlocks)) {
        continue;
      }

      suggestions.push({
        date,
        title: "Rec crowd window",
        label: hourToLabel(bucket.hour),
        location: "Campus Recreation Center",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        averagePeople: bucket.averagePeople,
        sampleCount: bucket.sampleCount,
        note: `Past ${targetWeekday}s around this time averaged about ${bucket.averagePeople} people across ${bucket.sampleCount} stored snapshot(s).`,
      });

      if (suggestions.length >= limit) {
        break;
      }
    }

    return suggestions;
  }

  async getCampusRecData({ date } = {}) {
    let liveData = null;
    let todaysHours = "Hours not found";
    let todaysEvents = [];

    try {
      liveData = await this.collectLiveSnapshot();
    } catch (error) {
      console.error("Failed to fetch live counter:", error.message);
    }

    try {
      const html = await requestText(this.websiteUrl);
      const $ = cheerio.load(html);
      const targetLabel = formatLongDate(
        date ??
          new Date().toLocaleDateString("en-CA", {
            timeZone: "America/Chicago",
          }),
      );

      $("dt.simcal-day-label").each((index, element) => {
        const labelText = $(element).text().trim();

        if (labelText !== targetLabel) {
          return;
        }

        const dayContainer = $(element).next("dd.simcal-day");

        dayContainer.find("li.simcal-event").each((eventIndex, eventElement) => {
          const wrapper = $(eventElement);
          const text = wrapper.find(".simcal-event-title").text().trim();

          if (text.includes("REC Hours:")) {
            if (todaysHours === "Hours not found") {
              todaysHours = text.replace("REC Hours:", "").trim();
            }
            return;
          }

          if (
            (text.includes("REC Class:") || text.includes("Special Event:")) &&
            todaysEvents.length < 8
          ) {
            const detailText =
              wrapper.find(".simcal-event-details").text().trim() || text;
            const parsed = parseEventText(detailText, date);

            todaysEvents.push({
              title: text,
              details: detailText,
              time: parsed.time,
              startsAt: parsed.startsAt,
              endsAt: parsed.endsAt,
              location: "Campus Recreation Center",
              url: wrapper.find("a").attr("href") || "",
            });
          }
        });
      });
    } catch (error) {
      console.error("Failed to scrape website:", error.message);
    }

    return {
      liveOccupancy: liveData,
      hours: todaysHours,
      events: todaysEvents,
    };
  }

  async respondToQuery(userInput, options = {}) {
    const recData = await this.getCampusRecData(options);

    return {
      recData,
      textResponse: handleRecQuery(userInput, recData, options),
    };
  }
}
