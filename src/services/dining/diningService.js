import { requestText } from "../../lib/http/request.js";

const DINING_HALLS = {
  missouri: {
    slug: "missouri-dining-hall",
    name: "Missouri Hall",
    siteId: "94118003",
    menuId: "14927",
  },
  ryle: {
    slug: "ryle-dining-hall",
    name: "Ryle Hall",
    siteId: "94118004",
    menuId: "14928",
  },
};

const MEAL_PERIODS = ["breakfast", "lunch", "dinner"];
const SODEXO_API_BASE_URL = "https://api-prd.sodexomyway.net/v0.2";
const SODEXO_PUBLIC_CLIENT_API_KEY = "68717828-b754-420d-9488-4c37cb7d7ef7";

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

function titleCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getFormattedDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getDayName(dateString) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date(`${dateString}T12:00:00`),
  );
}

function formatHourBlock(hourBlock) {
  if (!hourBlock?.startTime && !hourBlock?.finishTime) {
    return hourBlock?.allDay ? "Closed All Day" : "";
  }

  if (hourBlock?.allDay) {
    return `${hourBlock.label || "Hours"}: All Day`;
  }

  const start = hourBlock?.startTime
    ? `${hourBlock.startTime.hour}:${hourBlock.startTime.minute} ${hourBlock.startTime.period}`
    : "Unknown";
  const end = hourBlock?.finishTime
    ? `${hourBlock.finishTime.hour}:${hourBlock.finishTime.minute} ${hourBlock.finishTime.period}`
    : "Unknown";

  return `${hourBlock.label}: ${start} - ${end}`;
}

function parsePreloadedState(html) {
  const match = html.match(
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/i,
  );

  if (!match) {
    throw new Error("Could not find embedded Sodexo page data.");
  }

  return JSON.parse(match[1]);
}

function getLocationFragments(preloadedState) {
  const fragments = preloadedState?.composition?.subject?.regions?.flatMap(
    (region) => region.fragments ?? [],
  );

  const locationFragment = fragments?.find((fragment) => fragment.type === "Location");
  const menuFragment = fragments?.find((fragment) => fragment.type === "Menu");

  return {
    location: locationFragment?.content?.main ?? {},
    menu: menuFragment?.content?.main ?? {},
  };
}

function classifyMealSection(sectionName) {
  const normalized = normalizeText(sectionName);

  if (normalized.includes("breakfast")) {
    return ["breakfast"];
  }

  if (normalized.includes("brunch")) {
    return ["breakfast", "lunch"];
  }

  if (normalized.includes("lunch")) {
    return ["lunch"];
  }

  if (normalized.includes("dinner")) {
    return ["dinner"];
  }

  return [];
}

function isDisplayableMealItem(itemName) {
  const normalized = normalizeText(itemName);

  if (!normalized) {
    return false;
  }

  return ![
    "have a nice day",
    "chef's choice",
    "special of the day",
    "closed",
  ].includes(normalized);
}

function extractMealItemsFromSections(sections) {
  const meals = {
    breakfast: [],
    lunch: [],
    dinner: [],
  };

  for (const section of sections) {
    const matchedMeals = classifyMealSection(section?.name);

    if (!matchedMeals.length) {
      continue;
    }

    for (const group of section?.groups ?? []) {
      for (const item of group?.items ?? []) {
        const itemName = item?.formalName || item?.name || "";

        if (!isDisplayableMealItem(itemName)) {
          continue;
        }

        for (const meal of matchedMeals) {
          meals[meal].push(itemName);
        }
      }
    }
  }

  for (const meal of MEAL_PERIODS) {
    meals[meal] = [...new Set(meals[meal])];
  }

  return meals;
}

function extractMealItems(menuMain) {
  return extractMealItemsFromSections(
    Array.isArray(menuMain?.sections) ? menuMain.sections : [],
  );
}

function extractHours(locationMain, dateString) {
  const dayName = getDayName(dateString);
  const standardHours = locationMain?.openingHours?.standardHours ?? [];

  const matches = standardHours.filter((entry) =>
    (entry?.days ?? []).some((day) => day?.value === dayName),
  );

  if (!matches.length) {
    return {
      open: null,
      close: null,
      display: "Hours not found",
      periods: [],
    };
  }

  const periods = matches.flatMap((entry) =>
    (entry?.hours ?? []).map((hourBlock) => ({
      label: hourBlock?.label || "Hours",
      open: hourBlock?.startTime
        ? `${hourBlock.startTime.hour}:${hourBlock.startTime.minute} ${hourBlock.startTime.period}`
        : null,
      close: hourBlock?.finishTime
        ? `${hourBlock.finishTime.hour}:${hourBlock.finishTime.minute} ${hourBlock.finishTime.period}`
        : null,
      display: formatHourBlock(hourBlock),
     })),
  ).filter((period) => period.display);

  if (!periods.length) {
    return {
      open: null,
      close: null,
      display: "Closed All Day",
      periods: [],
    };
  }

  return {
    open: periods[0]?.open ?? null,
    close: periods[periods.length - 1]?.close ?? null,
    display: periods.map((period) => period.display).join("; "),
    periods,
  };
}

function extractHallFromText(text) {
  if (/\bmissouri\b/.test(text)) {
    return "missouri";
  }

  if (/\bryle\b/.test(text)) {
    return "ryle";
  }

  return null;
}

function extractMealFromText(text) {
  if (/\bbreakfast\b/.test(text)) {
    return "breakfast";
  }

  if (/\blunch\b/.test(text)) {
    return "lunch";
  }

  if (/\bdinner\b/.test(text)) {
    return "dinner";
  }

  return null;
}

function formatMealItems(mealName, items) {
  if (!items.length) {
    return `No ${mealName} items were found.`;
  }

  return `${titleCase(mealName)}: ${items.join(", ")}`;
}

function formatHallSummary(parsedHall) {
  return [
    `${parsedHall.hallName} hours: ${parsedHall.hours.display}.`,
    formatMealItems("breakfast", parsedHall.meals.breakfast),
    formatMealItems("lunch", parsedHall.meals.lunch),
    formatMealItems("dinner", parsedHall.meals.dinner),
  ].join(" ");
}

function findMealPeriod(hours, meal) {
  return hours?.periods?.find(
    (period) => normalizeText(period.label).includes(meal),
  );
}

function getCurrentHoursStatus(hours, date, timeZone) {
  if (!hours?.periods?.length || !isToday(date, timeZone)) {
    return {
      isToday: false,
      activePeriod: null,
      nextPeriod: null,
    };
  }

  const nowMinutes = getCurrentMinutes(timeZone);
  const parsedPeriods = hours.periods
    .map((period) => ({
      ...period,
      openMinutes: parseTimeToMinutes(period.open),
      closeMinutes: parseTimeToMinutes(period.close),
    }))
    .filter(
      (period) => period.openMinutes != null && period.closeMinutes != null,
    )
    .sort((left, right) => left.openMinutes - right.openMinutes);

  const activePeriod =
    parsedPeriods.find(
      (period) =>
        nowMinutes >= period.openMinutes && nowMinutes < period.closeMinutes,
    ) ?? null;
  const nextPeriod =
    parsedPeriods.find((period) => nowMinutes < period.openMinutes) ?? null;
  const lastPeriod = parsedPeriods[parsedPeriods.length - 1] ?? null;

  return {
    isToday: true,
    activePeriod,
    nextPeriod,
    lastPeriod,
    nowMinutes,
  };
}

export function handleDiningQuery(
  userInput,
  allDiningData,
  { date, timeZone = "America/Chicago" } = {},
) {
  const text = normalizeText(userInput);

  if (allDiningData?.error) {
    return `I couldn't load the dining data right now: ${allDiningData.error}`;
  }

  const hallKey = extractHallFromText(text);
  const meal = extractMealFromText(text);
  const hoursIntent = /\b(hours|hour|close|closing|open|opening|time|when)\b/.test(
    text,
  );
  const broadIntent =
    /\b(all dining halls|both halls|all halls|everything|full menu|all dining information)\b/.test(
      text,
    ) || (!hallKey && !meal);

  if (!hallKey && broadIntent) {
    return [
      "Here is the dining summary for both halls.",
      formatHallSummary(allDiningData.missouri),
      formatHallSummary(allDiningData.ryle),
    ].join(" ");
  }

  if (!hallKey) {
    return "Please tell me which dining hall you mean: Missouri Hall or Ryle Hall.";
  }

  const hall = allDiningData[hallKey];
  const currentStatus = getCurrentHoursStatus(hall.hours, date, timeZone);

  if (hoursIntent) {
    if (/\b(is .*open|are .*open|open right now|open now)\b/.test(text)) {
      if (currentStatus.isToday && currentStatus.activePeriod) {
        return `${hall.hallName} is open right now for ${currentStatus.activePeriod.label.toLowerCase()}. It stays open until ${currentStatus.activePeriod.close}.`;
      }

      if (currentStatus.isToday && currentStatus.nextPeriod) {
        return `${hall.hallName} is currently closed. It opens next for ${currentStatus.nextPeriod.label.toLowerCase()} at ${currentStatus.nextPeriod.open}.`;
      }

      if (currentStatus.isToday && currentStatus.lastPeriod) {
        return `${hall.hallName} is currently closed. Its last open period today was ${currentStatus.lastPeriod.label} from ${currentStatus.lastPeriod.open} to ${currentStatus.lastPeriod.close}.`;
      }

      return `${hall.hallName} hours today are ${hall.hours.display}.`;
    }

    if (/\b(close|closing)\b/.test(text)) {
      return hall.hours.close
        ? `${hall.hallName} closes at ${hall.hours.close} today.`
        : `I couldn't find the closing time for ${hall.hallName} today.`;
    }

    if (/\b(open|opening)\b/.test(text)) {
      return hall.hours.open
        ? `${hall.hallName} opens at ${hall.hours.open} today.`
        : `I couldn't find the opening time for ${hall.hallName} today.`;
    }

    return `${hall.hallName} hours today are ${hall.hours.display}.`;
  }

  if (meal) {
    const items = hall.meals[meal];
    const mealPeriod = findMealPeriod(hall.hours, meal);

    if (!items.length) {
      return `I could not find any ${meal} items for ${hall.hallName} today.`;
    }

    const mealTiming = mealPeriod
      ? currentStatus.isToday &&
        currentStatus.activePeriod &&
        normalizeText(currentStatus.activePeriod.label).includes(meal)
        ? ` ${titleCase(meal)} is being served right now and runs until ${mealPeriod.close}.`
        : currentStatus.isToday &&
            currentStatus.nowMinutes != null &&
            parseTimeToMinutes(mealPeriod.close) != null &&
            currentStatus.nowMinutes >= parseTimeToMinutes(mealPeriod.close)
          ? ` ${titleCase(meal)} was served from ${mealPeriod.open} to ${mealPeriod.close} today.`
          : currentStatus.isToday &&
              currentStatus.nowMinutes != null &&
              parseTimeToMinutes(mealPeriod.open) != null &&
              currentStatus.nowMinutes < parseTimeToMinutes(mealPeriod.open)
            ? ` ${titleCase(meal)} starts at ${mealPeriod.open} and runs until ${mealPeriod.close} today.`
            : ` ${titleCase(meal)} is served from ${mealPeriod.open} to ${mealPeriod.close}.`
      : "";

    return `${titleCase(meal)} at ${hall.hallName} today includes: ${items.join(", ")}.${mealTiming} If you want, I can help add a reminder to your schedule.`;
  }

  return formatHallSummary(hall);
}

export class DiningService {
  constructor({
    cache,
    cacheTtlMs = 15 * 60 * 1000,
    baseUrl = "https://truman.sodexomyway.com/en-us/locations",
    apiBaseUrl = SODEXO_API_BASE_URL,
    apiKey = SODEXO_PUBLIC_CLIENT_API_KEY,
  } = {}) {
    this.cache = cache;
    this.cacheTtlMs = cacheTtlMs;
    this.baseUrl = baseUrl;
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey || SODEXO_PUBLIC_CLIENT_API_KEY;
  }

  async fetchHallPage(hallConfig) {
    const url = `${this.baseUrl}/${hallConfig.slug}`;
    return requestText(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
  }

  async fetchHallMenuData(hallConfig, date) {
    const url = new URL(
      `${this.apiBaseUrl}/data/menu/${hallConfig.siteId}/${hallConfig.menuId}`,
    );
    url.searchParams.set("date", date);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Sodexo menu request failed with status ${response.status} ${response.statusText}.`,
      );
    }

    return response.json();
  }

  async fetchHallData(hallKey, date) {
    const hallConfig = DINING_HALLS[hallKey];
    const [html, menuSections] = await Promise.all([
      this.fetchHallPage(hallConfig),
      this.fetchHallMenuData(hallConfig, date),
    ]);
    const state = parsePreloadedState(html);
    const { location, menu } = getLocationFragments(state);

    return {
      hallKey,
      hallName: hallConfig.name,
      description: location?.description ?? "",
      location: location?.address?.street || hallConfig.name,
      hours: extractHours(location, date),
      meals: extractMealItemsFromSections(
        Array.isArray(menuSections) && menuSections.length
          ? menuSections
          : (menu?.sections ?? []),
      ),
      sourceUrl: `${this.baseUrl}/${hallConfig.slug}`,
      menuSource: "sodexo-menu-api",
    };
  }

  async getAllMenus({ date = getFormattedDate(), forceRefresh = false } = {}) {
    const cacheKey = `menus:${date}`;
    const cachedPayload = (await this.cache?.read?.()) ?? {};
    const cachedEntry = cachedPayload[cacheKey];
    const cacheIsFresh =
      cachedEntry &&
      Number.isFinite(cachedEntry.fetchedAt) &&
      cachedEntry?.missouri &&
      cachedEntry?.ryle &&
      Date.now() - cachedEntry.fetchedAt < this.cacheTtlMs;

    if (!forceRefresh && cacheIsFresh) {
      return {
        ...cachedEntry,
        source: "cache",
      };
    }

    const [missouriResult, ryleResult] = await Promise.allSettled([
      this.fetchHallData("missouri", date),
      this.fetchHallData("ryle", date),
    ]);

    const missouri =
      missouriResult.status === "fulfilled" ? missouriResult.value : null;
    const ryle = ryleResult.status === "fulfilled" ? ryleResult.value : null;
    const errors = [missouriResult, ryleResult]
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message)
      .filter(Boolean);

    const payload = {
      fetchedAt: Date.now(),
      date,
      missouri,
      ryle,
      ...(errors.length ? { error: errors[0] } : {}),
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
    const diningData = await this.getAllMenus(options);

    return {
      diningData,
      textResponse: handleDiningQuery(userInput, diningData, options),
    };
  }
}
