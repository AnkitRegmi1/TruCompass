import { DAILY_CONCIERGE_PROMPT } from "./dailyConciergePrompt.js";

function formatEventList(events) {
  if (!events.length) {
    return "None";
  }

  return events
    .map(
      (event) =>
        `- ${event.summary} (${event.displayTime}) at ${event.location || "TBD"}`,
    )
    .join("\n");
}

function formatFreeBlocks(blocks) {
  if (!blocks.length) {
    return "No free blocks available.";
  }

  return blocks.map((block) => `- ${block.label}`).join("\n");
}

function formatCampusUpdates(updates) {
  if (!updates?.length) {
    return "None";
  }

  return updates
    .map(
      (update) =>
        `- ${update.title} (${update.feedTitle}, ${update.displayTime}) :: ${update.summary}`,
    )
    .join("\n");
}

function formatCampusEventHighlights(events) {
  if (!events?.length) {
    return "None";
  }

  return events
    .map(
      (event) =>
        `- ${event.summary} (${event.displayTime})${event.location ? ` at ${event.location}` : ""}`,
    )
    .join("\n");
}

function formatAthleticsHighlights(events) {
  if (!events?.length) {
    return "None";
  }

  return events
    .map(
      (event) =>
        `- ${event.summary} (${event.displayTime})${event.location ? ` at ${event.location}` : ""}`,
    )
    .join("\n");
}

function buildFallbackText({
  requestType,
  intent,
  calendarConnected,
  campusEvents,
  allCampusEvents,
  athleticsEvents,
  allAthleticsEvents,
  mainEvents,
  fittingEvents,
  fittingAthleticsEvents,
  campusUpdates,
  date,
  meetingDraft,
  timeAwarenessNote,
}) {
  if (requestType === "SCHEDULE") {
    if (!calendarConnected) {
      return "I can help create that meeting, but I need your Google Calendar connected first.";
    }

    if (meetingDraft?.readyToCreate) {
      return `I have a meeting draft ready for ${meetingDraft.title}. Review it below, then create it in your calendar.`;
    }

    return (
      meetingDraft?.clarification ||
      "I can help schedule that meeting. I still need the event title, date, start time, and end time."
    );
  }

  if (!calendarConnected && intent === "SPECIFIC") {
    return `I can help with that, but I need your Google Calendar connected before I can tell you what fits your schedule on ${date}.`;
  }

  const intro =
    intent === "GENERAL"
      ? `Here is what is happening on campus on ${date}.`
      : `Here are the campus events that fit your schedule on ${date}.`;

  const hadEarlierEventsToday =
    !campusEvents.length &&
    !athleticsEvents.length &&
    ((allCampusEvents?.length ?? 0) > 0 || (allAthleticsEvents?.length ?? 0) > 0);

  const eventHighlights =
    intent === "GENERAL" && campusEvents.length
      ? ` Campus events today: ${campusEvents
          .slice(0, 4)
          .map((event) => `${event.summary} (${event.displayTime})`)
          .join(", ")}.`
      : "";
  const athleticsHighlights =
    intent === "GENERAL" && !campusEvents.length && athleticsEvents.length
      ? ` Local athletics today: ${athleticsEvents
          .slice(0, 4)
          .map((event) => `${event.summary} (${event.displayTime})`)
          .join(", ")}.`
      : "";
  const timeAwareWrapText =
    intent === "GENERAL" && hadEarlierEventsToday
      ? " The scheduled events for earlier today have already wrapped up."
      : "";

  const mainEventText =
    intent === "GENERAL" && mainEvents.length
      ? ` Main events: ${mainEvents.map((event) => event.summary).join(", ")}.`
      : "";

  const allFittingEvents = [...(fittingEvents ?? []), ...(fittingAthleticsEvents ?? [])];
  const fittingEventText = allFittingEvents.length
    ? ` Best fits: ${allFittingEvents.map((event) => event.summary).join(", ")}.`
    : calendarConnected
      ? " I did not find any events that fit neatly inside your free blocks."
      : " Connect your Google Calendar to get schedule-based recommendations.";

  const updateText = campusUpdates?.length
    ? ` Campus updates to know about: ${campusUpdates
        .slice(0, 3)
        .map((update) => update.title)
        .join(", ")}.`
    : "";

  return `${intro}${timeAwarenessNote ? ` ${timeAwarenessNote}` : ""}${eventHighlights}${athleticsHighlights}${timeAwareWrapText}${mainEventText}${fittingEventText}${updateText}`;
}

export class ResponseService {
  constructor({ llmClient, model }) {
    this.llmClient = llmClient;
    this.model = model;
  }

  #buildContents(context) {
    const conversationContents = (context.conversationMessages ?? []).map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.text }],
    }));

    return [
      ...conversationContents,
      {
        role: "user",
        parts: [
          {
            text: [
              `Date: ${context.date}`,
              `Time zone: ${context.timeZone}`,
              `Request type: ${context.requestType}`,
              `Intent: ${context.intent}`,
              `Calendar connected: ${context.calendarConnected ? "yes" : "no"}`,
              `Current local time note: ${context.timeAwarenessNote ?? "Not needed"}`,
              `Current question: ${context.question}`,
              `Meeting draft: ${JSON.stringify(context.meetingDraft ?? null)}`,
              `Free blocks:\n${formatFreeBlocks(context.freeBlocks)}`,
              `Campus events today:\n${formatCampusEventHighlights(context.campusEvents)}`,
              `All listed campus events today:\n${formatCampusEventHighlights(context.allCampusEvents ?? context.campusEvents)}`,
              `Local athletics today:\n${formatAthleticsHighlights(context.athleticsEvents)}`,
              `All listed local athletics today:\n${formatAthleticsHighlights(context.allAthleticsEvents ?? context.athleticsEvents)}`,
              `Main events:\n${formatEventList(context.mainEvents)}`,
              `Schedule-friendly events:\n${formatEventList(context.fittingEvents)}`,
              `Schedule-friendly athletics:\n${formatEventList(context.fittingAthleticsEvents ?? [])}`,
              `Campus updates:\n${formatCampusUpdates(context.campusUpdates)}`,
            ].join("\n\n"),
          },
        ],
      },
    ];
  }

  async createAnswer(context) {
    if (!this.llmClient.isConfigured()) {
      return buildFallbackText(context);
    }

    const response = await this.llmClient.generateText({
      model: this.model,
      maxOutputTokens: 350,
      systemInstruction: DAILY_CONCIERGE_PROMPT,
      contents: this.#buildContents(context),
    });

    return response.text;
  }

  async *createAnswerStream(context) {
    if (!this.llmClient.isConfigured()) {
      yield { type: "delta", text: buildFallbackText(context) };
      return;
    }

    yield* this.llmClient.generateTextStream({
      model: this.model,
      maxOutputTokens: 350,
      systemInstruction: DAILY_CONCIERGE_PROMPT,
      contents: this.#buildContents(context),
    });
  }
}
