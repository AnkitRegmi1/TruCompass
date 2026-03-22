import {
  getDayRange,
  getLocalDateKey,
  zonedTimeToUtc,
} from "../../lib/time/timeZone.js";

const LLM_SUMMARY_TIMEOUT_MS = 12_000;

async function withTimeout(promise, timeoutMs, fallbackValue = null) {
  let timeoutId;

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeServiceCall(factory, fallbackValue) {
  try {
    return await factory();
  } catch {
    return fallbackValue;
  }
}

function addDays(dateKey, days, timeZone) {
  const range = getDayRange(dateKey, timeZone);
  const next = new Date(range.start.getTime() + days * 24 * 60 * 60 * 1000);
  return getLocalDateKey(next, timeZone);
}

function getWeekDates(startDate, timeZone) {
  return Array.from({ length: 7 }, (_, index) => addDays(startDate, index, timeZone));
}

function matchesAnyKeyword(text, keywords) {
  const normalized = String(text ?? "").toLowerCase();
  return (keywords ?? []).some((keyword) =>
    normalized.includes(String(keyword ?? "").toLowerCase()),
  );
}

function isLikelyLocalEvent(candidate) {
  const location = String(candidate?.location ?? "").toLowerCase();
  const title = String(candidate?.summary ?? candidate?.title ?? "").toLowerCase();

  if (!location) {
    return true;
  }

  if (
    /\b(illinois|missouri s&t|lewis university|romeoville|springfield|st louis|quincy|indianapolis|chicago)\b/i.test(
      location,
    )
  ) {
    return false;
  }

  return /\b(kirksville|truman|baldwin|ophelia|quad|violette|pickler|rec|student union|sub|pershing|stokes|magruder|black box)\b/i.test(
    `${location} ${title}`,
  );
}

function chooseDiningHall(diningData, preferences) {
  const preferredHalls = (preferences.preferredDiningHalls ?? []).map((hall) =>
    String(hall).toLowerCase(),
  );

  for (const hallKey of preferredHalls) {
    if (diningData?.[hallKey]) {
      return diningData[hallKey];
    }
  }

  return diningData?.ryle ?? diningData?.missouri ?? null;
}

function normalizeCourseName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function inferCoursesFromWeekSchedule(weekSchedule) {
  const courseMap = new Map();

  for (const day of weekSchedule) {
    for (const event of day.busyEvents ?? []) {
      if (!event.isLikelyClass || !event.summary) {
        continue;
      }

      const key = normalizeCourseName(event.summary);
      const existing = courseMap.get(key) ?? {
        course: key,
        meetingCount: 0,
        days: new Set(),
        samples: [],
      };
      existing.meetingCount += 1;
      existing.days.add(day.date);
      if (existing.samples.length < 2) {
        existing.samples.push({
          date: day.date,
          label: event.label,
        });
      }
      courseMap.set(key, existing);
    }
  }

  return [...courseMap.values()]
    .map((entry) => ({
      course: entry.course,
      meetingCount: entry.meetingCount,
      dayCount: entry.days.size,
      samples: entry.samples,
    }))
    .sort((left, right) => right.meetingCount - left.meetingCount);
}

function getHourInTimeZone(isoString, timeZone) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date(isoString)),
  );
}

function chooseStudyStart(block, durationMinutes, timeZone, preferredStudyWindow) {
  const startDate = new Date(block.startsAt);
  const endDate = new Date(block.endsAt);
  const blockMinutes = block.durationMinutes;

  if (blockMinutes <= durationMinutes) {
    return startDate;
  }

  const preferred = String(preferredStudyWindow ?? "").toLowerCase();
  const startHour = getHourInTimeZone(block.startsAt, timeZone);
  const endHour = getHourInTimeZone(block.endsAt, timeZone);

  if (preferred.includes("evening") && endHour >= 17) {
    return new Date(endDate.getTime() - durationMinutes * 60_000);
  }

  if (preferred.includes("afternoon") && startHour <= 15 && endHour >= 12) {
    const noonish = new Date(startDate.getTime());
    noonish.setUTCHours(noonish.getUTCHours() + Math.max(0, 12 - startHour));
    if (noonish.getTime() + durationMinutes * 60_000 <= endDate.getTime()) {
      return noonish;
    }
  }

  return startDate;
}

function chooseMealItems(hall, mealName, preferences) {
  const items = hall?.meals?.[mealName] ?? [];

  if (!items.length) {
    return [];
  }

  const favoriteFoods = preferences.favoriteFoods ?? [];
  const dislikedFoods = preferences.dislikedFoods ?? [];
  const prioritized = items
    .filter((item) => !matchesAnyKeyword(item, dislikedFoods))
    .sort((left, right) => {
      const leftScore = matchesAnyKeyword(left, favoriteFoods) ? 1 : 0;
      const rightScore = matchesAnyKeyword(right, favoriteFoods) ? 1 : 0;
      return rightScore - leftScore;
    });

  return prioritized.slice(0, 4);
}

function getLocalMinutesFromIso(isoString, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(isoString));

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return hour * 60 + minute;
}

function buildIsoFromLocalMinutes(dateKey, totalMinutes, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return zonedTimeToUtc(
    {
      year,
      month,
      day,
      hour,
      minute,
      second: 0,
    },
    timeZone,
  ).toISOString();
}

function getDefaultMealMinutes(mealName) {
  return mealName === "dinner" ? 18 * 60 : 12 * 60 + 15;
}

function parsePreferredMealMinutes(value, mealName) {
  const text = String(value ?? "").trim().toLowerCase();

  if (!text) {
    return getDefaultMealMinutes(mealName);
  }

  if (text.includes("noon")) {
    return 12 * 60;
  }

  if (text.includes("evening")) {
    return 18 * 60;
  }

  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);

  if (!match) {
    return getDefaultMealMinutes(mealName);
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  if (!meridiem && hour < 8 && mealName === "dinner") {
    hour += 12;
  }

  return hour * 60 + minute;
}

function chooseMealSchedule({
  date,
  mealName,
  schedule,
  timeZone,
  preferences,
}) {
  const preferredMinutes = parsePreferredMealMinutes(
    preferences.preferredMealWindows?.[mealName],
    mealName,
  );
  const freeBlocks = schedule?.freeBlocks ?? [];
  const mealDurationMinutes = 45;
  let bestChoice = null;

  for (const block of freeBlocks) {
    if ((block.durationMinutes ?? 0) < mealDurationMinutes) {
      continue;
    }

    const blockStartMinutes = getLocalMinutesFromIso(block.startsAt, timeZone);
    const blockEndMinutes = getLocalMinutesFromIso(block.endsAt, timeZone);
    const latestStartMinutes = blockEndMinutes - mealDurationMinutes;
    const candidateMinutes = Math.max(
      blockStartMinutes,
      Math.min(preferredMinutes, latestStartMinutes),
    );
    const distance = Math.abs(candidateMinutes - preferredMinutes);

    if (!bestChoice || distance < bestChoice.distance) {
      bestChoice = {
        candidateMinutes,
        distance,
      };
    }
  }

  const chosenMinutes = bestChoice?.candidateMinutes ?? preferredMinutes;
  const startsAt = buildIsoFromLocalMinutes(date, chosenMinutes, timeZone);
  const endsAt = buildIsoFromLocalMinutes(
    date,
    chosenMinutes + mealDurationMinutes,
    timeZone,
  );

  return {
    startsAt,
    endsAt,
    displayTime:
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(startsAt)) +
      " - " +
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(endsAt)),
    note:
      schedule?.calendarConnected && bestChoice
        ? "Chosen from your free time so this meal fits around classes and meetings."
        : "Suggested around the usual meal window for that day.",
  };
}

function chooseSurpriseEvent(days, preferences) {
  if (!preferences.wantsSurpriseEvents) {
    return null;
  }

  const favorites = preferences.favoriteEventTypes ?? [];
  const candidates = days.flatMap((day) => [
    ...(day.fittingEvents ?? []).map((event) => ({
      ...event,
      date: day.date,
    })),
    ...(day.athleticsEvents ?? [])
      .filter(isLikelyLocalEvent)
      .map((event) => ({
        ...event,
        date: day.date,
      })),
    ...(day.recData?.events ?? []).map((event) => ({
      ...event,
      date: day.date,
    })),
  ]);

  return (
    candidates.find((candidate) => {
      const title = candidate.summary || candidate.title || "";
      return !matchesAnyKeyword(title, favorites);
    }) ?? candidates[0] ?? null
  );
}

function overlapsAnyRange(startsAt, endsAt, ranges = []) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return ranges.some(
    (range) =>
      start < new Date(range.endsAt ?? range.end) &&
      end > new Date(range.startsAt ?? range.start),
  );
}

function buildReservationMap(weekSchedule) {
  return new Map(
    (weekSchedule ?? []).map((day) => [
      day.date,
      (day.busyBlocks ?? []).map((block) => ({
        startsAt: block.startsAt,
        endsAt: block.endsAt,
      })),
    ]),
  );
}

function reserveItem(item, reservationsByDate) {
  if (!item?.date || !item?.startsAt || !item?.endsAt) {
    return;
  }

  const reservations = reservationsByDate.get(item.date) ?? [];
  reservations.push({
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  });
  reservationsByDate.set(item.date, reservations);
}

function canPlaceItem(item, reservationsByDate) {
  if (!item?.startsAt || !item?.endsAt || !item?.date) {
    return true;
  }

  return !overlapsAnyRange(
    item.startsAt,
    item.endsAt,
    reservationsByDate.get(item.date) ?? [],
  );
}

function dedupeTimedItems(items, getKey) {
  const seen = new Set();

  return (items ?? []).filter((item) => {
    const key = getKey(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function fitsFreeBlocks(startsAt, endsAt, freeBlocks = []) {
  return freeBlocks.some(
    (block) =>
      new Date(startsAt) >= new Date(block.startsAt) &&
      new Date(endsAt) <= new Date(block.endsAt),
  );
}

function matchesRecTimePreference(startsAt, preferredRecTime, timeZone) {
  const preferred = String(preferredRecTime ?? "").toLowerCase();

  if (!preferred || !startsAt) {
    return true;
  }

  const hour = getHourInTimeZone(startsAt, timeZone);

  if (preferred.includes("morning")) {
    return hour >= 6 && hour < 12;
  }

  if (preferred.includes("afternoon")) {
    return hour >= 12 && hour < 17;
  }

  if (preferred.includes("evening")) {
    return hour >= 17;
  }

  if (preferred.includes("after class")) {
    return hour >= 15 && hour <= 20;
  }

  return true;
}

function isRecClassKeyword(activity) {
  return /\b(class|classes|yoga|pilates|glowga|dance|hiit|fitness)\b/i.test(
    String(activity ?? ""),
  );
}

function getSelfDirectedRecActivities(preferences) {
  const rawActivities = preferences.preferredRecActivities ?? [];
  const filtered = rawActivities.filter((activity) => !isRecClassKeyword(activity));

  if (filtered.length) {
    return filtered;
  }

  return ["workout"];
}

function getDesiredRecSessions(preferences) {
  return Math.max(0, Number(preferences?.recSessionsPerWeek ?? 0) || 0);
}

function buildRecActivityTitle(activity) {
  const normalized = String(activity ?? "").toLowerCase();

  if (/\b(weight|lift|strength)\b/.test(normalized)) {
    return "Weights session";
  }

  if (/\b(cardio|run|running|treadmill)\b/.test(normalized)) {
    return "Cardio session";
  }

  if (/\b(open gym|basketball|pickup)\b/.test(normalized)) {
    return "Open gym session";
  }

  if (/\b(walk|recovery|mobility|stretch)\b/.test(normalized)) {
    return "Recovery workout";
  }

  return `${String(activity ?? "Workout")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())} session`;
}

function buildNextQuestions(preferences, calendarConnected) {
  const questions = [];

  if (!calendarConnected) {
    questions.push("Connect Google Calendar so I can plan around your real class schedule.");
  }

  if (!(preferences.preferredDiningHalls ?? []).length) {
    questions.push("Which dining halls do you like most: Missouri Hall, Ryle Hall, or both?");
  }

  if (!(preferences.favoriteFoods ?? []).length) {
    questions.push("What foods do you usually want me to look for this week?");
  }

  if (!(preferences.favoriteEventTypes ?? []).length) {
    questions.push("What kinds of events do you want more of this week: arts, athletics, academic, social, or wellness?");
  }

  if (!(preferences.preferredRecActivities ?? []).length) {
    questions.push("For the Rec, do you want weights, treadmill or running time, open gym, or scheduled Rec classes?");
  }

  if (preferences.wantsRecClasses === null) {
    questions.push("Do you want me to include scheduled Rec classes in your week too, or should I only plan weights, cardio, or open gym time?");
  }

  if (!preferences.preferredRecTime) {
    questions.push("If you want Rec time this week, what time of day should I look for it: morning, afternoon, evening, or after class?");
  }

  if (!getDesiredRecSessions(preferences)) {
    questions.push("How many Rec sessions should I fit into your week?");
  }

  if (!preferences.preferredRecCrowd) {
    questions.push("When you go to the Rec, do you want a quieter time with fewer people, a balanced time, or a busier high-energy window?");
  }

  if (preferences.wantsSurpriseEvents === null) {
    questions.push("Do you want one surprise event outside your comfort zone this week?");
  }

  if (!preferences.weeklyFocus) {
    questions.push("What should I optimize for this week: balance, productivity, fun, wellness, or low stress?");
  }

  if (!preferences.preferredStudyWindow) {
    questions.push("When do you want study blocks in Pickler Library: between classes, afternoons, evenings, or weekends?");
  }
  if (!preferences.studyHoursPerWeek) {
    questions.push("How many hours do you want me to protect for study time this week?");
  }
  if (!(preferences.hardestCourses ?? []).length) {
    questions.push("Which one or two classes need the most study time this week?");
  }

  return questions.slice(0, 7);
}

function scoreStudyBlock(block, preferenceWindow, timeZone) {
  const label = String(block?.label ?? "").toLowerCase();
  const preferred = String(preferenceWindow ?? "").toLowerCase();
  const hour = getHourInTimeZone(block.startsAt, timeZone);

  if (!preferred) {
    return 1;
  }

  if (preferred.includes("between") && /\b(am|pm)\b/.test(label)) {
    return 2;
  }

  if (preferred.includes("afternoon") && hour >= 12 && hour < 17) {
    return 3;
  }

  if (preferred.includes("evening") && hour >= 17) {
    return 3;
  }

  if (preferred.includes("weekend")) {
    return 2;
  }

  return 1;
}

function buildStudySuggestions(weekSchedule, librarySnapshot, preferences, timeZone, inferredCourses) {
  const desiredHours = Math.max(0, Number(preferences.studyHoursPerWeek ?? 0) || 0);
  const desiredMinutes = desiredHours > 0 ? desiredHours * 60 : 180;
  let assignedMinutes = 0;
  const hardestCourses = preferences.hardestCourses ?? [];
  const coursePool =
    hardestCourses.length > 0
      ? hardestCourses
      : (inferredCourses ?? []).slice(0, 3).map((course) => course.course);

  const candidates = weekSchedule
    .flatMap((day) =>
      (day.freeBlocks ?? []).map((block) => ({
        date: day.date,
        ...block,
        score: scoreStudyBlock(block, preferences.preferredStudyWindow, timeZone),
      })),
    )
    .filter((block) => block.durationMinutes >= 60)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.durationMinutes - left.durationMinutes;
    });

  const chosen = [];

  for (const block of candidates) {
    if (assignedMinutes >= desiredMinutes) {
      break;
    }

    const remainingMinutes = desiredMinutes - assignedMinutes;
    const sessionMinutes = Math.min(block.durationMinutes, remainingMinutes, 120);
    const start = chooseStudyStart(
      block,
      sessionMinutes,
      timeZone,
      preferences.preferredStudyWindow,
    );
    const end = new Date(start.getTime() + sessionMinutes * 60_000);
    const assignedCourse =
      coursePool.length > 0 ? coursePool[chosen.length % coursePool.length] : "";
    chosen.push({
      date: block.date,
      label: new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(start) +
      " - " +
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      }).format(end),
      location: "Pickler Memorial Library",
      durationMinutes: sessionMinutes,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      course: assignedCourse,
      note:
        librarySnapshot?.hours && librarySnapshot.hours !== "Hours not found"
          ? `Library hours snapshot: ${librarySnapshot.hours}`
          : "Library study block suggestion",
    });
    assignedMinutes += sessionMinutes;
  }

  return chosen;
}

function scoreEventForPreferences(event, preferences) {
  const eventText = `${event.summary || event.title || ""} ${event.location || ""}`;
  const favoriteTypes = preferences.favoriteEventTypes ?? [];
  const recActivities = preferences.preferredRecActivities ?? [];
  const score =
    (matchesAnyKeyword(eventText, favoriteTypes) ? 3 : 0) +
    (matchesAnyKeyword(eventText, recActivities) ? 2 : 0) +
    (isLikelyLocalEvent(event) ? 1 : 0);
  return score;
}

function getCampusEventCandidatesForDay(day) {
  const campusPool =
    day.fittingEvents?.length > 0
      ? day.fittingEvents
      : day.mainEvents?.length > 0
        ? day.mainEvents
        : day.campusEvents ?? [];

  const athleticsPool =
    day.fittingAthleticsEvents?.length > 0
      ? day.fittingAthleticsEvents
      : (day.athleticsEvents ?? []).filter(isLikelyLocalEvent).slice(0, 2);

  return [...campusPool, ...athleticsPool];
}

function scoreRecBlock(block, preferredRecTime, timeZone) {
  const preferred = String(preferredRecTime ?? "").toLowerCase();
  const hour = getHourInTimeZone(block.startsAt, timeZone);

  if (!preferred) {
    return 1;
  }

  if (preferred.includes("morning") && hour >= 6 && hour < 12) {
    return 3;
  }

  if (preferred.includes("afternoon") && hour >= 12 && hour < 17) {
    return 3;
  }

  if (preferred.includes("evening") && hour >= 17) {
    return 3;
  }

  if (preferred.includes("after class") && hour >= 15 && hour <= 20) {
    return 3;
  }

  return 1;
}

function chooseRecStart(block, durationMinutes, timeZone, preferredRecTime) {
  const startDate = new Date(block.startsAt);
  const endDate = new Date(block.endsAt);
  const preferred = String(preferredRecTime ?? "").toLowerCase();

  if (block.durationMinutes <= durationMinutes) {
    return startDate;
  }

  if (preferred.includes("evening")) {
    return new Date(endDate.getTime() - durationMinutes * 60_000);
  }

  return startDate;
}

function buildFallbackRecWindows(weekSchedule, preferences, timeZone) {
  return weekSchedule
    .flatMap((day) =>
      (day.freeBlocks ?? []).map((block) => ({
        date: day.date,
        ...block,
        score: scoreRecBlock(block, preferences.preferredRecTime, timeZone),
      })),
    )
    .filter((block) => block.durationMinutes >= 60)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.durationMinutes - left.durationMinutes;
    })
    .slice(0, 4)
    .map((block) => {
      const durationMinutes = Math.min(60, block.durationMinutes);
      const start = chooseRecStart(
        block,
        durationMinutes,
        timeZone,
        preferences.preferredRecTime,
      );
      const end = new Date(start.getTime() + durationMinutes * 60_000);

      return {
        date: block.date,
        label:
          new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
          }).format(start) +
          " - " +
          new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
          }).format(end),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        location: "Campus Recreation Center",
        note: "Built from your free time because there is not enough saved Rec crowd history yet.",
      };
    });
}

async function buildRecCrowdSuggestions({
  weekDates,
  weekSchedule,
  campusRecService,
  preferences,
  timeZone,
}) {
  const suggestions = [];
  const desiredSessions = getDesiredRecSessions(preferences);
  const limit = desiredSessions > 0 ? Math.min(desiredSessions, 4) : 4;

  for (const date of weekDates) {
    const schedule = weekSchedule.find((entry) => entry.date === date);
    const freeBlocks = schedule?.freeBlocks ?? [];
    const daySuggestions = await campusRecService.getCrowdWindowSuggestions({
      date,
      freeBlocks,
      preferredRecCrowd: preferences.preferredRecCrowd,
      preferredRecTime: preferences.preferredRecTime,
      timeZone,
      limit: 1,
    });

    suggestions.push(...daySuggestions);

    if (suggestions.length >= limit) {
      break;
    }
  }

  return suggestions;
}

function buildSelfDirectedRecSuggestions({
  recCrowdSuggestions,
  weekSchedule,
  preferences,
  timeZone,
}) {
  const activityPool = getSelfDirectedRecActivities(preferences);
  const desiredSessions = getDesiredRecSessions(preferences);
  const windows =
    recCrowdSuggestions.length > 0
      ? recCrowdSuggestions
      : buildFallbackRecWindows(weekSchedule, preferences, timeZone);

  const limit = desiredSessions > 0 ? desiredSessions : 4;

  return windows.slice(0, limit).map((window, index) => {
    const activity = activityPool[index % activityPool.length];

    return {
      date: window.date,
      title: buildRecActivityTitle(activity),
      time: window.label,
      location: "Campus Recreation Center",
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      note: window.note,
      kind: "self-directed",
    };
  });
}

function buildRecClassSuggestions({
  dailyCampus,
  weekSchedule,
  preferences,
  timeZone,
}) {
  const desiredSessions = getDesiredRecSessions(preferences);
  const limit = desiredSessions > 0 ? Math.max(desiredSessions * 2, 4) : 10;

  return dailyCampus
    .flatMap((day) => {
      const schedule = weekSchedule.find((entry) => entry.date === day.date);

      return (day.recData?.events ?? [])
        .filter((event) => {
          if (!event.startsAt || !event.endsAt) {
            return true;
          }

          if (
            schedule?.calendarConnected &&
            !fitsFreeBlocks(event.startsAt, event.endsAt, schedule.freeBlocks ?? [])
          ) {
            return false;
          }

          return matchesRecTimePreference(
            event.startsAt,
            preferences.preferredRecTime,
            timeZone,
          );
        })
        .map((event) => ({
          ...event,
          date: day.date,
          note: event.details || "",
          kind: "class",
        }));
    })
    .slice(0, limit);
}

function sortTimedItems(items) {
  return [...(items ?? [])].sort(
    (left, right) =>
      new Date(left.startsAt ?? 0).getTime() - new Date(right.startsAt ?? 0).getTime(),
  );
}

function combineRecSuggestions({
  selfDirectedRecSuggestions,
  recClassSuggestions,
  preferences,
}) {
  const desiredSessions = getDesiredRecSessions(preferences);
  const limit = desiredSessions > 0 ? desiredSessions : 4;

  if (preferences.wantsRecClasses !== true) {
    return sortTimedItems(selfDirectedRecSuggestions).slice(0, limit);
  }

  const combined = [];
  const classPool = sortTimedItems(recClassSuggestions);
  const workoutPool = sortTimedItems(selfDirectedRecSuggestions);

  if (limit > 1 && classPool.length && workoutPool.length) {
    combined.push(classPool.shift());
    combined.push(workoutPool.shift());
  }

  const remaining = sortTimedItems([...classPool, ...workoutPool]);

  for (const item of remaining) {
    if (combined.length >= limit) {
      break;
    }

    combined.push(item);
  }

  return sortTimedItems(combined).slice(0, limit);
}

function buildFallbackPlanText({
  weekDates,
  calendarConnected,
  mealSuggestions,
  eventSuggestions,
  recSuggestions,
  studySuggestions,
  recCrowdSuggestions,
  updateHighlights,
  surprisePick,
  nextQuestions,
  diningNote,
  studyHoursPerWeek,
}) {
  const parts = [
    `I planned your Truman week from ${weekDates[0]} through ${weekDates[weekDates.length - 1]}.`,
    calendarConnected
      ? "I used your Google Calendar free blocks to keep the suggestions realistic."
      : "I could make this much more personal once your Google Calendar is connected.",
  ];

  if (mealSuggestions.length) {
    parts.push(
      `Meals to keep in mind: ${mealSuggestions
        .slice(0, 4)
        .map((item) => `${item.date} ${item.meal} at ${item.hall}: ${item.items.join(", ")}`)
        .join("; ")}.`,
    );
  }

  if (diningNote) {
    parts.push(diningNote);
  }

  if (eventSuggestions.length) {
    parts.push(
      `Best campus fits: ${eventSuggestions
        .slice(0, 4)
        .map((event) => `${event.date} ${event.summary} (${event.displayTime})`)
        .join("; ")}.`,
    );
  }

  if (recSuggestions.length) {
    parts.push(
      `Rec ideas: ${recSuggestions
        .slice(0, 3)
        .map((event) => `${event.date} ${event.title}${event.time ? ` at ${event.time}` : ""}`)
        .join("; ")}.`,
    );
  }

  if (recCrowdSuggestions.length) {
    parts.push(
      `Crowd-aware Rec windows: ${recCrowdSuggestions
        .slice(0, 3)
        .map((item) => `${item.date} ${item.label}, usually about ${item.averagePeople} people`)
        .join("; ")}.`,
    );
  }

  if (studySuggestions.length) {
    parts.push(
      `Study blocks to consider: ${studySuggestions
        .slice(0, 3)
        .map((item) => `${item.date} ${item.label} in ${item.location} for ${item.durationMinutes} minutes`)
        .join("; ")}.`,
    );
  }

  if (studyHoursPerWeek) {
    parts.push(`I targeted about ${studyHoursPerWeek} hour(s) of study time this week based on your calendar.`);
  }

  if (updateHighlights.length) {
    parts.push(
      `Important updates: ${updateHighlights
        .slice(0, 3)
        .map((update) => update.title)
        .join("; ")}.`,
    );
  }

  if (surprisePick) {
    parts.push(
      `Surprise pick: ${(surprisePick.summary || surprisePick.title) ?? "something different"}${surprisePick.displayTime || surprisePick.time ? ` at ${surprisePick.displayTime || surprisePick.time}` : ""}.`,
    );
  }

  return parts.join(" ");
}

function placeItemsWithoutConflicts(items, reservationsByDate) {
  const placedItems = [];

  for (const item of items ?? []) {
    if (!canPlaceItem(item, reservationsByDate)) {
      continue;
    }

    reserveItem(item, reservationsByDate);
    placedItems.push(item);
  }

  return placedItems;
}

export class WeekPlannerService {
  constructor({
    googleCalendarService,
    trumanEventsService,
    diningService,
    campusRecService,
    newsletterService,
    libraryService,
    academicCalendarService,
    eventMatchService,
    knowledgeService,
    preferencesService,
    llmClient,
    model,
    defaultTimeZone,
  }) {
    this.googleCalendarService = googleCalendarService;
    this.trumanEventsService = trumanEventsService;
    this.diningService = diningService;
    this.campusRecService = campusRecService;
    this.newsletterService = newsletterService;
    this.libraryService = libraryService;
    this.academicCalendarService = academicCalendarService;
    this.eventMatchService = eventMatchService;
    this.knowledgeService = knowledgeService;
    this.preferencesService = preferencesService;
    this.llmClient = llmClient;
    this.model = model;
    this.defaultTimeZone = defaultTimeZone;
  }

  async getPlanningContext({ userId, date, timeZone }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const weekDates = getWeekDates(date, resolvedTimeZone);
    const weekSchedule = await Promise.all(
      weekDates.map(async (day) =>
        userId
          ? this.googleCalendarService.getDailySchedule({
              userId,
              date: day,
              timeZone: resolvedTimeZone,
            })
          : {
              calendarConnected: false,
              busyBlocks: [],
              freeBlocks: [],
              date: day,
              timeZone: resolvedTimeZone,
            },
      ),
    );

    return {
      userId,
      date,
      timeZone: resolvedTimeZone,
      weekDates,
      calendarConnected: weekSchedule.some((day) => day.calendarConnected),
      inferredCourses: inferCoursesFromWeekSchedule(weekSchedule),
    };
  }

  async planWeek({
    userId,
    date,
    timeZone,
    preferences = {},
    forceRefresh = false,
    question = "Plan my week",
  }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const mergedPreferences = userId
      ? await this.preferencesService.mergePreferences(userId, preferences)
      : preferences;
    const weekDates = getWeekDates(date, resolvedTimeZone);

    const weekSchedule = await Promise.all(
      weekDates.map(async (day) =>
        userId
          ? this.googleCalendarService.getDailySchedule({
              userId,
              date: day,
              timeZone: resolvedTimeZone,
            })
          : {
              calendarConnected: false,
              busyBlocks: [],
              freeBlocks: [],
              date: day,
              timeZone: resolvedTimeZone,
            },
      ),
    );

    const dailyCampus = await Promise.all(
      weekDates.map(async (day) => {
        const [campusEvents, athleticsEvents, campusUpdates, recData, dining] =
          await Promise.all([
            safeServiceCall(
              () =>
                this.trumanEventsService.getEventsForDate({
                  date: day,
                  timeZone: resolvedTimeZone,
                  forceRefresh,
                }),
              { events: [], mainEvents: [], source: "fallback" },
            ),
            safeServiceCall(
              () =>
                this.trumanEventsService.getAthleticsEventsForDate({
                  date: day,
                  timeZone: resolvedTimeZone,
                  forceRefresh,
                }),
              { events: [], source: "fallback" },
            ),
            safeServiceCall(
              () =>
                this.trumanEventsService.getFeedUpdates({
                  date: day,
                  timeZone: resolvedTimeZone,
                  forceRefresh,
                  limit: 8,
                }),
              { updates: [], source: "fallback" },
            ),
            safeServiceCall(
              () => this.campusRecService.getCampusRecData({ date: day }),
              {
                hoursText: "Hours unavailable",
                currentPeople: null,
                classes: [],
                events: [],
              },
            ),
            safeServiceCall(
              () =>
                this.diningService.getAllMenus({
                  date: day,
                  forceRefresh,
                }),
              {},
            ),
          ]);

        const schedule =
          weekSchedule.find((entry) => entry.date === day) ?? weekSchedule[0];
        const fittingEvents = schedule.calendarConnected
          ? this.eventMatchService.findEventsThatFitFreeBlocks(
              campusEvents.events,
              schedule.freeBlocks,
            )
          : campusEvents.events.slice(0, 4);
        const fittingAthleticsEvents = schedule.calendarConnected
          ? this.eventMatchService.findEventsThatFitFreeBlocks(
              athleticsEvents.events.filter(isLikelyLocalEvent),
              schedule.freeBlocks,
            )
          : athleticsEvents.events.filter(isLikelyLocalEvent).slice(0, 4);

        return {
          date: day,
          campusEvents: campusEvents.events,
          mainEvents: campusEvents.mainEvents,
          athleticsEvents: athleticsEvents.events,
          fittingAthleticsEvents,
          campusUpdates: campusUpdates.updates,
          recData,
          dining,
          fittingEvents,
        };
      }),
    );

    const [newsletter, librarySnapshot, academicCalendar] = await Promise.all([
      this.newsletterService.getIssue({ forceRefresh }),
      this.libraryService.getTodaySnapshot().catch(() => ({
        url: this.libraryService.url,
        hours: "Hours not found",
      })),
      this.academicCalendarService.getEntries().catch(() => ({
        url: this.academicCalendarService.url,
        entries: [],
      })),
    ]);

    const mealSuggestions = dailyCampus
      .flatMap((day) => {
        const hall = chooseDiningHall(day.dining, mergedPreferences);
        const schedule =
          weekSchedule.find((entry) => entry.date === day.date) ?? weekSchedule[0];

        if (!hall) {
          return [];
        }

        return ["lunch", "dinner"]
          .map((mealName) => {
            const items = chooseMealItems(hall, mealName, mergedPreferences);

            if (!items.length) {
              return null;
            }

            const scheduledMeal = chooseMealSchedule({
              date: day.date,
              mealName,
              schedule,
              timeZone: resolvedTimeZone,
              preferences: mergedPreferences,
            });

            return {
              date: day.date,
              meal: mealName,
              hall: hall.hallName,
              items,
              displayTime: scheduledMeal.displayTime,
              startsAt: scheduledMeal.startsAt,
              endsAt: scheduledMeal.endsAt,
              note: scheduledMeal.note,
            };
          })
          .filter(Boolean);
      })
      .slice(0, 14);

    const inferredCourses = inferCoursesFromWeekSchedule(weekSchedule);

    const rawEventSuggestions = dailyCampus
      .flatMap((day) =>
        getCampusEventCandidatesForDay(day)
          .map((event) => ({
            ...event,
            date: day.date,
            score: scoreEventForPreferences(event, mergedPreferences),
          }))
          .sort((left, right) => right.score - left.score)
          .slice(0, 2),
      )
      .slice(0, 6);

    const updateHighlights = dailyCampus
      .flatMap((day) => day.campusUpdates)
      .slice(0, 8);

    const surpriseCandidate = chooseSurpriseEvent(
      dailyCampus.map((day) => ({
        ...day,
        athleticsEvents: day.fittingAthleticsEvents ?? [],
      })),
      mergedPreferences,
    );
    const recCrowdSuggestions = await buildRecCrowdSuggestions({
      weekDates,
      weekSchedule,
      campusRecService: this.campusRecService,
      preferences: mergedPreferences,
      timeZone: resolvedTimeZone,
    });
    const rawSelfDirectedRecSuggestions = buildSelfDirectedRecSuggestions({
      recCrowdSuggestions,
      weekSchedule,
      preferences: mergedPreferences,
      timeZone: resolvedTimeZone,
    });
    const rawRecClassSuggestions =
      mergedPreferences.wantsRecClasses === true
        ? buildRecClassSuggestions({
            dailyCampus,
            weekSchedule,
            preferences: mergedPreferences,
            timeZone: resolvedTimeZone,
          })
        : [];
    const rawStudySuggestions = buildStudySuggestions(
      weekSchedule,
      librarySnapshot,
      mergedPreferences,
      resolvedTimeZone,
      inferredCourses,
    );
    const reservationsByDate = buildReservationMap(weekSchedule);
    const studySuggestions = placeItemsWithoutConflicts(
      dedupeTimedItems(
        rawStudySuggestions,
        (item) => `${item.date}|${item.course ?? ""}|${item.startsAt ?? ""}|study`,
      ),
      reservationsByDate,
    );
    const eventSuggestions = placeItemsWithoutConflicts(
      dedupeTimedItems(
        rawEventSuggestions,
        (event) =>
          `${event.date}|${event.summary}|${event.startsAt ?? ""}|${event.location ?? ""}`,
      ),
      reservationsByDate,
    );
    const mealSuggestionsWithoutConflicts = placeItemsWithoutConflicts(
      dedupeTimedItems(
        mealSuggestions,
        (item) => `${item.date}|${item.meal}|${item.hall}|${item.startsAt ?? ""}`,
      ),
      reservationsByDate,
    );
    const recClassSuggestions = placeItemsWithoutConflicts(
      dedupeTimedItems(
        rawRecClassSuggestions,
        (item) => `${item.date}|${item.title}|${item.startsAt ?? ""}|${item.location ?? ""}`,
      ),
      reservationsByDate,
    );
    const selfDirectedRecSuggestions = placeItemsWithoutConflicts(
      dedupeTimedItems(
        rawSelfDirectedRecSuggestions,
        (item) => `${item.date}|${item.title}|${item.startsAt ?? ""}`,
      ),
      reservationsByDate,
    );
    const recSuggestions = combineRecSuggestions({
      selfDirectedRecSuggestions,
      recClassSuggestions,
      preferences: mergedPreferences,
    });
    const surprisePick =
      surpriseCandidate && canPlaceItem(surpriseCandidate, reservationsByDate)
        ? surpriseCandidate
        : null;
    const diningNote =
      "Dining menu suggestions use Sodexo's live per-date menu data, so they can change as the dining site updates.";
    const academicHighlights = (academicCalendar.entries ?? []).filter((entry) =>
      weekDates.includes(entry.date),
    );
    const knowledgeDocuments = this.knowledgeService.buildWeeklyKnowledge({
      weekSchedule,
      dailyCampus,
      newsletter,
      librarySnapshot,
      academicCalendar: {
        ...academicCalendar,
        entries: academicHighlights,
      },
    });
    const knowledgeMatches = this.knowledgeService.search(question, knowledgeDocuments, 6);
    const calendarConnected = weekSchedule.some((day) => day.calendarConnected);
    const nextQuestions = buildNextQuestions(mergedPreferences, calendarConnected);

    let textResponse = buildFallbackPlanText({
      weekDates,
      calendarConnected,
      mealSuggestions: mealSuggestionsWithoutConflicts,
      eventSuggestions,
      recSuggestions,
      studySuggestions,
      recCrowdSuggestions,
      updateHighlights,
      surprisePick,
      nextQuestions,
      diningNote,
      studyHoursPerWeek: mergedPreferences.studyHoursPerWeek,
    });

    if (this.llmClient?.isConfigured()) {
      const result = await withTimeout(
        this.llmClient.createTextResponse({
          model: this.model,
          maxOutputTokens: 500,
          systemPrompt:
            "You are a Truman State weekly planning assistant. Write a short, conversational weekly plan summary. Mention the student's week range, how the Google Calendar shaped the plan when connected, a few meal ideas, a few events that fit, Rec options, study-library suggestions, key campus/news updates, and one surprise suggestion if present. Do not end with follow-up questions. Do not invent data.",
          userPrompt: JSON.stringify(
            {
              weekDates,
              calendarConnected,
              preferences: mergedPreferences,
              mealSuggestions: mealSuggestionsWithoutConflicts,
              eventSuggestions,
              recSuggestions,
              recCrowdSuggestions,
              studySuggestions,
              updateHighlights: updateHighlights.slice(0, 5),
              librarySnapshot,
              academicHighlights,
              inferredCourses: inferredCourses.slice(0, 5),
              surprisePick,
              diningNote,
              studyHoursPerWeek: mergedPreferences.studyHoursPerWeek,
            },
            null,
            2,
          ),
        }),
        LLM_SUMMARY_TIMEOUT_MS,
        null,
      ).catch(() => null);

      if (result?.text) {
        textResponse = result.text;
      }
    }

    return {
      userId,
      date,
      timeZone: resolvedTimeZone,
      weekDates,
      calendarConnected,
      preferences: mergedPreferences,
      weekSchedule,
      inferredCourses,
      dailyCampus,
      mealSuggestions: mealSuggestionsWithoutConflicts,
      eventSuggestions,
      recSuggestions,
      recCrowdSuggestions,
      studySuggestions,
      updateHighlights,
      newsletter,
      librarySnapshot,
      academicHighlights,
      surprisePick,
      diningNote,
      knowledgeMatches,
      nextQuestions,
      textResponse,
    };
  }
}
