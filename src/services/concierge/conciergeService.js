import {
  formatDateTime,
  getDayRange,
  getLocalDateKey,
  getTodayDateKey,
} from "../../lib/time/timeZone.js";

const DINING_QUERY_PATTERN =
  /\b(dining|menu|menus|food|eat|eating|breakfast|lunch|dinner|missouri hall|ryle hall|missouri|ryle)\b/i;
const REC_QUERY_PATTERN =
  /\b(rec|recreation|gym|occupancy|crowded|capacity|how busy|people at the rec|fitness|yoga)\b/i;
const ATHLETICS_QUERY_PATTERN =
  /\b(athletics|bulldogs|game|games|match|matches|sport|sports|football|soccer|basketball|softball|volleyball|tennis|wrestling|baseball|swimming|track)\b/i;
const NEWSLETTER_QUERY_PATTERN =
  /\b(newsletter|truman today|announcement|announcements|news|headline|headlines)\b/i;
const WEEK_PLAN_QUERY_PATTERN =
  /\b(plan my week|weekly plan|week plan|plan out my week|help me plan my week)\b/i;
const ATHLETICS_SPORT_KEYWORDS = [
  "baseball",
  "softball",
  "tennis",
  "basketball",
  "football",
  "soccer",
  "volleyball",
  "wrestling",
  "swimming",
  "track",
];

function tokenize(value) {
  return String(value ?? "")
    .toLowerCase()
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

function conversationMentionsRec(messages) {
  const recentText = (messages ?? [])
    .slice(-6)
    .map((message) => message.text)
    .join(" ");

  return /\b(campus rec|rec class|glowga|pilates|yoga|dance fitness|people at the campus rec|campus recreation center)\b/i.test(
    recentText,
  );
}

function isLikelyLocalAthleticsEvent(event) {
  const haystack = `${event?.location ?? ""} ${event?.summary ?? ""}`.toLowerCase();

  if (!haystack.trim()) {
    return true;
  }

  if (
    /\b(fayette|upper iowa|romeoville|lewis university|springfield|illinois|quincy|indianapolis|st louis|chicago)\b/i.test(
      haystack,
    )
  ) {
    return false;
  }

  return /\b(kirksville|truman|bulldog|pershing|stokes)\b/i.test(haystack);
}

function findMentionedSport(question) {
  const normalized = String(question ?? "").toLowerCase();
  return ATHLETICS_SPORT_KEYWORDS.find((sport) => normalized.includes(sport)) ?? null;
}

function formatAthleticsAnswer({
  athleticsEvents,
  allAthleticsEvents = athleticsEvents,
  athleticsUpdates,
  date,
}) {
  if (athleticsEvents.length) {
    return `Here are the athletics events I found for ${date}: ${athleticsEvents
      .slice(0, 5)
      .map((event) => `${event.summary} (${event.displayTime}${event.location ? ` at ${event.location}` : ""})`)
      .join("; ")}. If you want, I can help add one of these to your schedule.`;
  }

  if (allAthleticsEvents.length) {
    return `The listed athletics events for ${date} have already wrapped up. Earlier today I saw: ${allAthleticsEvents
      .slice(0, 4)
      .map((event) => `${event.summary} (${event.displayTime}${event.location ? ` at ${event.location}` : ""})`)
      .join("; ")}.`;
  }

  if (athleticsUpdates.length) {
    return `I didn't find scheduled athletics events for ${date}, but here are the latest athletics updates: ${athleticsUpdates
      .slice(0, 4)
      .map((update) => `${update.title} from ${update.feedTitle}`)
      .join("; ")}.`;
  }

  return `I couldn't find any athletics events or current athletics updates for ${date}.`;
}

function formatAthleticsQueryAnswer({
  question,
  athleticsEvents,
  allAthleticsEvents = athleticsEvents,
  athleticsUpdates,
  date,
}) {
  const mentionedSport = findMentionedSport(question);
  const sportFilteredEvents = mentionedSport
    ? athleticsEvents.filter((event) =>
        `${event.summary ?? ""} ${event.location ?? ""}`
          .toLowerCase()
          .includes(mentionedSport),
      )
    : athleticsEvents;
  const allSportFilteredEvents = mentionedSport
    ? allAthleticsEvents.filter((event) =>
        `${event.summary ?? ""} ${event.location ?? ""}`
          .toLowerCase()
          .includes(mentionedSport),
      )
    : allAthleticsEvents;
  const rankedEvents = athleticsEvents
    .map((event) => ({
      event,
      score: scoreMatch(question, `${event.summary} ${event.location || ""}`),
    }))
    .sort((left, right) => right.score - left.score);

  if (mentionedSport && sportFilteredEvents.length === 1) {
    const match = sportFilteredEvents[0];
    return `Yes, ${match.summary} is happening on ${date} at ${match.displayTime}${match.location ? ` in ${match.location}` : ""}. If you want, I can help add it to your schedule.`;
  }

  if (mentionedSport && sportFilteredEvents.length > 1) {
    return `Yes, I found these ${mentionedSport} events for ${date}: ${sportFilteredEvents
      .slice(0, 4)
      .map((event) => `${event.summary} (${event.displayTime}${event.location ? ` at ${event.location}` : ""})`)
      .join("; ")}. If you want, I can help add one of these to your schedule.`;
  }

  if (mentionedSport && !sportFilteredEvents.length && allSportFilteredEvents.length) {
    return `There was ${mentionedSport} on ${date}, but it has already wrapped up. Earlier I saw: ${allSportFilteredEvents
      .slice(0, 3)
      .map((event) => `${event.summary} (${event.displayTime}${event.location ? ` at ${event.location}` : ""})`)
      .join("; ")}.`;
  }

  if (rankedEvents[0]?.score > 0) {
    const match = rankedEvents[0].event;
    return `${match.summary} is scheduled for ${match.displayTime}${match.location ? ` at ${match.location}` : ""}. If you want, I can help add it to your schedule.`;
  }

  const rankedUpdates = athleticsUpdates
    .map((update) => ({
      update,
      score: scoreMatch(
        question,
        `${update.title} ${update.feedTitle} ${update.summary}`,
      ),
    }))
    .sort((left, right) => right.score - left.score);

  if (rankedUpdates[0]?.score > 0) {
    const match = rankedUpdates[0].update;
    return `${match.title} from ${match.feedTitle}. ${match.summary}${match.url ? ` You can read more here: ${match.url}` : ""}`;
  }

  return formatAthleticsAnswer({
    athleticsEvents,
    allAthleticsEvents,
    athleticsUpdates,
    date,
  });
}

function addDays(dateKey, days, timeZone) {
  const range = getDayRange(dateKey, timeZone);
  const next = new Date(range.start.getTime() + days * 24 * 60 * 60 * 1000);
  return getLocalDateKey(next, timeZone);
}

function parseExplicitDate(question, baseDateKey) {
  const isoMatch = String(question).match(/\b(20\d{2}-\d{2}-\d{2})\b/);

  if (isoMatch) {
    return isoMatch[1];
  }

  const slashMatch = String(question).match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);

  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const resolvedYear = year ?? baseDateKey.slice(0, 4);
    return `${resolvedYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseWeekdayDate(question, baseDateKey, timeZone) {
  const weekdayMatch = String(question).toLowerCase().match(
    /\b(?:(next|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );

  if (!weekdayMatch) {
    return null;
  }

  const modifier = weekdayMatch[1] ?? "";
  const weekday = weekdayMatch[2];
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const targetIndex = weekdays.indexOf(weekday);
  const currentDate = getDayRange(baseDateKey, timeZone).start;
  const currentIndex = currentDate.getUTCDay();
  let delta = (targetIndex - currentIndex + 7) % 7;

  if (modifier === "next") {
    delta = delta === 0 ? 7 : delta;
  }

  return addDays(baseDateKey, delta, timeZone);
}

function resolveQuestionDate(question, selectedDate, timeZone) {
  const baseDateKey = selectedDate ?? getTodayDateKey(timeZone);
  const normalized = String(question ?? "").toLowerCase();

  const explicitDate = parseExplicitDate(normalized, baseDateKey);
  if (explicitDate) {
    return explicitDate;
  }

  if (/\bday after tomorrow\b/.test(normalized)) {
    return addDays(baseDateKey, 2, timeZone);
  }

  if (/\btomorrow\b/.test(normalized)) {
    return addDays(baseDateKey, 1, timeZone);
  }

  if (/\byesterday\b/.test(normalized)) {
    return addDays(baseDateKey, -1, timeZone);
  }

  if (/\btoday\b/.test(normalized)) {
    return baseDateKey;
  }

  return parseWeekdayDate(normalized, baseDateKey, timeZone) ?? baseDateKey;
}

function isCurrentOrUpcomingEvent(event, now) {
  if (!event?.endsAt) {
    return true;
  }

  return new Date(event.endsAt).getTime() >= now.getTime();
}

function prioritizeTodayEvents(events, dateKey, timeZone) {
  if (dateKey !== getTodayDateKey(timeZone)) {
    return events;
  }

  const now = new Date();
  return events.filter((event) => isCurrentOrUpcomingEvent(event, now));
}

function summarizeTimeAwareness(allEvents, activeEvents, dateKey, timeZone) {
  if (dateKey !== getTodayDateKey(timeZone)) {
    return null;
  }

  if (activeEvents.length) {
    return `As of ${formatDateTime(new Date(), timeZone, {
      timeStyle: "short",
    })}, I am prioritizing what is happening now or later today.`;
  }

  if (allEvents.length) {
    return `As of ${formatDateTime(new Date(), timeZone, {
      timeStyle: "short",
    })}, the listed events for today have already wrapped up.`;
  }

  return `As of ${formatDateTime(new Date(), timeZone, {
    timeStyle: "short",
  })}, I am not seeing anything posted for the rest of today.`;
}

function getRelevantEventsForAnswer(allEvents, activeEvents, dateKey, timeZone) {
  if (dateKey === getTodayDateKey(timeZone)) {
    return activeEvents;
  }

  return allEvents;
}

export class ConciergeService {
  constructor({
    trumanEventsService,
    googleCalendarService,
    campusRecService,
    diningService,
    newsletterService,
    weekPlannerService,
    intentService,
    eventMatchService,
    responseService,
    meetingDraftService,
    conversationStoreService,
    audioService,
    defaultTimeZone,
  }) {
    this.trumanEventsService = trumanEventsService;
    this.googleCalendarService = googleCalendarService;
    this.campusRecService = campusRecService;
    this.diningService = diningService;
    this.newsletterService = newsletterService;
    this.weekPlannerService = weekPlannerService;
    this.intentService = intentService;
    this.eventMatchService = eventMatchService;
    this.responseService = responseService;
    this.meetingDraftService = meetingDraftService;
    this.conversationStoreService = conversationStoreService;
    this.audioService = audioService;
    this.defaultTimeZone = defaultTimeZone;
  }

  async respond({
    conversationId,
    userId,
    question,
    date,
    timeZone,
    includeAudio = true,
    forceRefreshEvents = false,
  }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const resolvedDate = resolveQuestionDate(
      question,
      date ?? getTodayDateKey(resolvedTimeZone),
      resolvedTimeZone,
    );
    const conversation = await this.conversationStoreService.getConversation(
      conversationId,
    );
    const isSchedulingRequest =
      this.meetingDraftService.isSchedulingRequest(question);
    const isCreateConfirmation =
      this.meetingDraftService.isCreateConfirmation(question);
    const requestType =
      isSchedulingRequest || isCreateConfirmation ? "SCHEDULE" : "CAMPUS";
    const isDiningQuery = DINING_QUERY_PATTERN.test(question);
    const isRecQuery =
      REC_QUERY_PATTERN.test(question) ||
      (conversationMentionsRec(conversation.messages) &&
        /\b(glowga|pilates|yoga|dance|fitness|other|another|more|what about)\b/i.test(
          question,
        ));
    const isAthleticsQuery = ATHLETICS_QUERY_PATTERN.test(question);
    const isNewsletterQuery = NEWSLETTER_QUERY_PATTERN.test(question);
    const isWeekPlanQuery = WEEK_PLAN_QUERY_PATTERN.test(question);
    const intent = this.intentService.classifyIntent(question);

    if (isWeekPlanQuery && !isSchedulingRequest) {
      const weekPlan = await this.weekPlannerService.planWeek({
        userId,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
        question,
      });
      const audio = includeAudio
        ? await this.audioService.synthesize(weekPlan.textResponse)
        : null;
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        weekPlan.textResponse,
      );

      return {
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "WEEK_PLAN",
        question,
        intent,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        weekPlan,
        textResponse: weekPlan.textResponse,
        audio,
        metadata: {
          source: "planner",
        },
      };
    }

    if (isDiningQuery && !isSchedulingRequest) {
      const diningResult = await this.diningService.respondToQuery(question, {
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      });
      const audio = includeAudio
        ? await this.audioService.synthesize(diningResult.textResponse)
        : null;
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        diningResult.textResponse,
      );

      return {
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "DINING",
        question,
        intent,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        diningData: diningResult.diningData,
        textResponse: diningResult.textResponse,
        audio,
        metadata: {
          source: diningResult.diningData.source,
        },
      };
    }

    if (isRecQuery && !isSchedulingRequest) {
      const recResult = await this.campusRecService.respondToQuery(question, {
        date: resolvedDate,
        timeZone: resolvedTimeZone,
      });
      const audio = includeAudio
        ? await this.audioService.synthesize(recResult.textResponse)
        : null;
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        recResult.textResponse,
      );

      return {
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "REC",
        question,
        intent,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        recData: recResult.recData,
        textResponse: recResult.textResponse,
        audio,
        metadata: {
          source: "live",
        },
      };
    }

    if (isNewsletterQuery && !isSchedulingRequest) {
      const newsletterResult = await this.newsletterService.respondToQuery(question, {
        forceRefresh: forceRefreshEvents,
      });
      const audio = includeAudio
        ? await this.audioService.synthesize(newsletterResult.textResponse)
        : null;
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        newsletterResult.textResponse,
      );

      return {
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "NEWSLETTER",
        question,
        intent,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        newsletter: newsletterResult.issue,
        textResponse: newsletterResult.textResponse,
        audio,
        metadata: {
          source: newsletterResult.issue.source,
        },
      };
    }

    const needsCalendar = intent === "SPECIFIC" && Boolean(userId);
    const [eventsForDate, athleticsEventsForDate, feedUpdates, schedule] = await Promise.all([
      this.trumanEventsService.getEventsForDate({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      this.trumanEventsService.getAthleticsEventsForDate({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      this.trumanEventsService.getFeedUpdates({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      needsCalendar
        ? this.googleCalendarService.getDailySchedule({
            userId,
            date: resolvedDate,
            timeZone: resolvedTimeZone,
          })
        : Promise.resolve({
            calendarConnected: false,
            busyBlocks: [],
            freeBlocks: [],
            date: resolvedDate,
            timeZone: resolvedTimeZone,
          }),
    ]);

    if (isAthleticsQuery && !isSchedulingRequest) {
      const athleticsUpdates = feedUpdates.updates.filter(
        (update) => update.category === "Athletics",
      );
      const activeAthleticsEvents = prioritizeTodayEvents(
        athleticsEventsForDate.events,
        resolvedDate,
        resolvedTimeZone,
      );
      const relevantAthleticsEvents = getRelevantEventsForAnswer(
        athleticsEventsForDate.events,
        activeAthleticsEvents,
        resolvedDate,
        resolvedTimeZone,
      );
      const textResponse = formatAthleticsQueryAnswer({
        question,
        athleticsEvents: relevantAthleticsEvents,
        allAthleticsEvents: athleticsEventsForDate.events,
        athleticsUpdates,
        date: resolvedDate,
      });
      const audio = includeAudio
        ? await this.audioService.synthesize(textResponse)
        : null;
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        textResponse,
      );

      return {
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "ATHLETICS",
        question,
        intent,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        athleticsEvents: relevantAthleticsEvents,
        athleticsUpdates,
        textResponse,
        audio,
        metadata: {
          source: athleticsEventsForDate.source,
        },
      };
    }

    const activeCampusEvents = prioritizeTodayEvents(
      eventsForDate.events,
      resolvedDate,
      resolvedTimeZone,
    );
    const activeAthleticsEvents = prioritizeTodayEvents(
      athleticsEventsForDate.events,
      resolvedDate,
      resolvedTimeZone,
    );
    const relevantCampusEvents = getRelevantEventsForAnswer(
      eventsForDate.events,
      activeCampusEvents,
      resolvedDate,
      resolvedTimeZone,
    );
    const relevantAthleticsEvents = getRelevantEventsForAnswer(
      athleticsEventsForDate.events,
      activeAthleticsEvents,
      resolvedDate,
      resolvedTimeZone,
    );
    const fittingEvents = schedule.calendarConnected
      ? this.eventMatchService.findEventsThatFitFreeBlocks(
          relevantCampusEvents,
          schedule.freeBlocks,
        )
      : [];
    const localAthleticsEvents = relevantAthleticsEvents.filter(
      isLikelyLocalAthleticsEvent,
    );
    const fittingAthleticsEvents = schedule.calendarConnected
      ? this.eventMatchService.findEventsThatFitFreeBlocks(
          localAthleticsEvents,
          schedule.freeBlocks,
        )
      : localAthleticsEvents;

    const mainEvents = relevantCampusEvents.filter((event) => event.isMainEvent);
    const meetingDraft =
      requestType === "SCHEDULE"
        ? await this.meetingDraftService.buildDraft({
            question,
            conversationMessages: conversation.messages,
            currentDate: resolvedDate,
          })
        : null;
    const textResponse = await this.responseService.createAnswer({
      requestType,
      intent,
      question,
      date: resolvedDate,
      timeZone: resolvedTimeZone,
      conversationMessages: conversation.messages,
      calendarConnected: schedule.calendarConnected,
      meetingDraft,
      freeBlocks: schedule.freeBlocks,
      campusEvents: eventsForDate.events,
      allCampusEvents: eventsForDate.events,
      athleticsEvents: localAthleticsEvents,
      allAthleticsEvents: athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent),
      mainEvents,
      fittingEvents,
      fittingAthleticsEvents,
      campusUpdates: feedUpdates.updates,
      timeAwarenessNote: summarizeTimeAwareness(
        [...eventsForDate.events, ...athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent)],
        [...relevantCampusEvents, ...localAthleticsEvents],
        resolvedDate,
        resolvedTimeZone,
      ),
    });

    const audio = includeAudio
      ? await this.audioService.synthesize(textResponse)
      : null;
    const updatedConversation = await this.conversationStoreService.appendTurn(
      conversation.conversationId,
      question,
      textResponse,
    );

    return {
      conversationId: conversation.conversationId,
      conversation: updatedConversation,
      requestType,
      question,
      intent,
      date: resolvedDate,
      timeZone: resolvedTimeZone,
      calendarConnected: schedule.calendarConnected,
      busyBlocks: schedule.busyBlocks,
      freeBlocks: schedule.freeBlocks,
      campusEvents: relevantCampusEvents,
      allCampusEvents: eventsForDate.events,
      athleticsEvents: localAthleticsEvents,
      allAthleticsEvents: athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent),
      mainEvents,
      fittingEvents,
      fittingAthleticsEvents,
      campusUpdates: feedUpdates.updates,
      timeAwarenessNote: summarizeTimeAwareness(
        [...eventsForDate.events, ...athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent)],
        [...relevantCampusEvents, ...localAthleticsEvents],
        resolvedDate,
        resolvedTimeZone,
      ),
      meetingDraft,
      textResponse,
      audio,
      metadata: {
        source: eventsForDate.source,
        eventCount: eventsForDate.events.length,
      },
    };
  }

  async *respondStream({
    conversationId,
    userId,
    question,
    date,
    timeZone,
    forceRefreshEvents = false,
  }) {
    const resolvedTimeZone = timeZone ?? this.defaultTimeZone;
    const resolvedDate = resolveQuestionDate(
      question,
      date ?? getTodayDateKey(resolvedTimeZone),
      resolvedTimeZone,
    );
    const conversation = await this.conversationStoreService.getConversation(conversationId);
    const isSchedulingRequest = this.meetingDraftService.isSchedulingRequest(question);
    const isCreateConfirmation = this.meetingDraftService.isCreateConfirmation(question);
    const requestType = isSchedulingRequest || isCreateConfirmation ? "SCHEDULE" : "CAMPUS";
    const isDiningQuery = DINING_QUERY_PATTERN.test(question);
    const isRecQuery =
      REC_QUERY_PATTERN.test(question) ||
      (conversationMentionsRec(conversation.messages) &&
        /\b(glowga|pilates|yoga|dance|fitness|other|another|more|what about)\b/i.test(question));
    const isAthleticsQuery = ATHLETICS_QUERY_PATTERN.test(question);
    const isNewsletterQuery = NEWSLETTER_QUERY_PATTERN.test(question);
    const isWeekPlanQuery = WEEK_PLAN_QUERY_PATTERN.test(question);
    const intent = this.intentService.classifyIntent(question);

    yield { type: "meta", conversationId: conversation.conversationId };

    if (isWeekPlanQuery && !isSchedulingRequest) {
      const weekPlan = await this.weekPlannerService.planWeek({
        userId,
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
        question,
      });
      yield { type: "delta", text: weekPlan.textResponse };
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        weekPlan.textResponse,
      );
      yield {
        type: "done",
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "WEEK_PLAN",
        textResponse: weekPlan.textResponse,
        weekPlan,
      };
      return;
    }

    if (isDiningQuery && !isSchedulingRequest) {
      const diningResult = await this.diningService.respondToQuery(question, {
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      });
      yield { type: "delta", text: diningResult.textResponse };
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        diningResult.textResponse,
      );
      yield {
        type: "done",
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "DINING",
        textResponse: diningResult.textResponse,
      };
      return;
    }

    if (isRecQuery && !isSchedulingRequest) {
      const recResult = await this.campusRecService.respondToQuery(question, {
        date: resolvedDate,
        timeZone: resolvedTimeZone,
      });
      yield { type: "delta", text: recResult.textResponse };
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        recResult.textResponse,
      );
      yield {
        type: "done",
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "REC",
        textResponse: recResult.textResponse,
      };
      return;
    }

    if (isNewsletterQuery && !isSchedulingRequest) {
      const newsletterResult = await this.newsletterService.respondToQuery(question, {
        forceRefresh: forceRefreshEvents,
      });
      yield { type: "delta", text: newsletterResult.textResponse };
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        newsletterResult.textResponse,
      );
      yield {
        type: "done",
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "NEWSLETTER",
        textResponse: newsletterResult.textResponse,
      };
      return;
    }

    const needsCalendar = intent === "SPECIFIC" && Boolean(userId);
    const [eventsForDate, athleticsEventsForDate, feedUpdates, schedule] = await Promise.all([
      this.trumanEventsService.getEventsForDate({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      this.trumanEventsService.getAthleticsEventsForDate({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      this.trumanEventsService.getFeedUpdates({
        date: resolvedDate,
        timeZone: resolvedTimeZone,
        forceRefresh: forceRefreshEvents,
      }),
      needsCalendar
        ? this.googleCalendarService.getDailySchedule({
            userId,
            date: resolvedDate,
            timeZone: resolvedTimeZone,
          })
        : Promise.resolve({
            calendarConnected: false,
            busyBlocks: [],
            freeBlocks: [],
            date: resolvedDate,
            timeZone: resolvedTimeZone,
          }),
    ]);

    if (isAthleticsQuery && !isSchedulingRequest) {
      const athleticsUpdates = feedUpdates.updates.filter((u) => u.category === "Athletics");
      const activeAthleticsEvents = prioritizeTodayEvents(
        athleticsEventsForDate.events,
        resolvedDate,
        resolvedTimeZone,
      );
      const relevantAthleticsEvents = getRelevantEventsForAnswer(
        athleticsEventsForDate.events,
        activeAthleticsEvents,
        resolvedDate,
        resolvedTimeZone,
      );
      const textResponse = formatAthleticsQueryAnswer({
        question,
        athleticsEvents: relevantAthleticsEvents,
        allAthleticsEvents: athleticsEventsForDate.events,
        athleticsUpdates,
        date: resolvedDate,
      });
      yield { type: "delta", text: textResponse };
      const updatedConversation = await this.conversationStoreService.appendTurn(
        conversation.conversationId,
        question,
        textResponse,
      );
      yield {
        type: "done",
        conversationId: conversation.conversationId,
        conversation: updatedConversation,
        requestType: "ATHLETICS",
        textResponse,
      };
      return;
    }

    const activeCampusEvents = prioritizeTodayEvents(
      eventsForDate.events,
      resolvedDate,
      resolvedTimeZone,
    );
    const activeAthleticsEvents = prioritizeTodayEvents(
      athleticsEventsForDate.events,
      resolvedDate,
      resolvedTimeZone,
    );
    const relevantCampusEvents = getRelevantEventsForAnswer(
      eventsForDate.events,
      activeCampusEvents,
      resolvedDate,
      resolvedTimeZone,
    );
    const relevantAthleticsEvents = getRelevantEventsForAnswer(
      athleticsEventsForDate.events,
      activeAthleticsEvents,
      resolvedDate,
      resolvedTimeZone,
    );
    const fittingEvents = schedule.calendarConnected
      ? this.eventMatchService.findEventsThatFitFreeBlocks(relevantCampusEvents, schedule.freeBlocks)
      : [];
    const localAthleticsEvents = relevantAthleticsEvents.filter(isLikelyLocalAthleticsEvent);
    const fittingAthleticsEvents = schedule.calendarConnected
      ? this.eventMatchService.findEventsThatFitFreeBlocks(localAthleticsEvents, schedule.freeBlocks)
      : localAthleticsEvents;
    const mainEvents = relevantCampusEvents.filter((event) => event.isMainEvent);
    const meetingDraft =
      requestType === "SCHEDULE"
        ? await this.meetingDraftService.buildDraft({
            question,
            conversationMessages: conversation.messages,
            currentDate: resolvedDate,
          })
        : null;

    const context = {
      requestType,
      intent,
      question,
      date: resolvedDate,
      timeZone: resolvedTimeZone,
      conversationMessages: conversation.messages,
      calendarConnected: schedule.calendarConnected,
      meetingDraft,
      freeBlocks: schedule.freeBlocks,
      campusEvents: eventsForDate.events,
      allCampusEvents: eventsForDate.events,
      athleticsEvents: localAthleticsEvents,
      allAthleticsEvents: athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent),
      mainEvents,
      fittingEvents,
      fittingAthleticsEvents,
      campusUpdates: feedUpdates.updates,
      timeAwarenessNote: summarizeTimeAwareness(
        [
          ...eventsForDate.events,
          ...athleticsEventsForDate.events.filter(isLikelyLocalAthleticsEvent),
        ],
        [...relevantCampusEvents, ...localAthleticsEvents],
        resolvedDate,
        resolvedTimeZone,
      ),
    };

    let streamedText = "";
    for await (const chunk of this.responseService.createAnswerStream(context)) {
      if (chunk.type === "delta") {
        streamedText += chunk.text;
        yield { type: "delta", text: chunk.text };
      }
    }

    const updatedConversation = await this.conversationStoreService.appendTurn(
      conversation.conversationId,
      question,
      streamedText,
    );

    yield {
      type: "done",
      conversationId: conversation.conversationId,
      conversation: updatedConversation,
      requestType,
      textResponse: streamedText,
      calendarConnected: schedule.calendarConnected,
      meetingDraft,
    };
  }
}
