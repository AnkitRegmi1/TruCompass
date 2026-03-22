export const KIRKSVILLE_TIME_ZONE = "America/Chicago";

const DATE_TIME_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?$/;

function parseOffsetMinutes(offsetLabel) {
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

  if (!match) {
    throw new Error(`Unable to parse timezone offset "${offsetLabel}".`);
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const timeZoneName = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!timeZoneName) {
    throw new Error(`Unable to determine timezone offset for ${timeZone}.`);
  }

  return parseOffsetMinutes(timeZoneName);
}

export function zonedTimeToUtc(components, timeZone) {
  const targetUtcTime = Date.UTC(
    components.year,
    components.month - 1,
    components.day,
    components.hour ?? 0,
    components.minute ?? 0,
    components.second ?? 0,
  );

  let guess = targetUtcTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
    const nextGuess = targetUtcTime - offsetMinutes * 60 * 1000;

    if (nextGuess === guess) {
      return new Date(nextGuess);
    }

    guess = nextGuess;
  }

  return new Date(guess);
}

export function parseTrumanDateTime(value, timeZone = KIRKSVILLE_TIME_ZONE) {
  const match = value?.match(DATE_TIME_PATTERN);

  if (!match) {
    throw new Error(`Unsupported Truman date value "${value}".`);
  }

  const isAllDay = !match[4];
  const components = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };

  return {
    raw: value,
    isAllDay,
    localDate: `${match[1]}-${match[2]}-${match[3]}`,
    utcDate: zonedTimeToUtc(components, timeZone),
  };
}

export function formatDateTime(date, timeZone, options = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(options.dateStyle ? { dateStyle: options.dateStyle } : {}),
    ...(options.timeStyle ? { timeStyle: options.timeStyle } : {}),
  }).format(date);
}

export function getLocalDateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getTodayDateKey(timeZone) {
  return getLocalDateKey(new Date(), timeZone);
}

export function getDayRange(dateKey, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return {
    start: zonedTimeToUtc(
      { year, month, day, hour: 0, minute: 0, second: 0 },
      timeZone,
    ),
    end: zonedTimeToUtc(
      { year, month, day: day + 1, hour: 0, minute: 0, second: 0 },
      timeZone,
    ),
  };
}

export function getWakingRange(dateKey, timeZone, wakeStartHour, wakeEndHour) {
  const [year, month, day] = dateKey.split("-").map(Number);

  return {
    start: zonedTimeToUtc(
      { year, month, day, hour: wakeStartHour, minute: 0, second: 0 },
      timeZone,
    ),
    end: zonedTimeToUtc(
      { year, month, day, hour: wakeEndHour, minute: 0, second: 0 },
      timeZone,
    ),
  };
}

export function buildDisplayTimeRange(startDate, endDate, timeZone, isAllDay) {
  if (isAllDay) {
    return "All day";
  }

  return `${formatDateTime(startDate, timeZone, {
    timeStyle: "short",
  })} - ${formatDateTime(endDate, timeZone, {
    timeStyle: "short",
  })}`;
}
