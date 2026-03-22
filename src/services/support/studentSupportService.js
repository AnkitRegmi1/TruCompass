import { getDayRange, getLocalDateKey } from "../../lib/time/timeZone.js";

function normalizeText(value) {
  return String(value ?? "").toLowerCase().trim();
}

function addDays(dateKey, days, timeZone) {
  const range = getDayRange(dateKey, timeZone);
  const next = new Date(range.start.getTime() + days * 24 * 60 * 60 * 1000);
  return getLocalDateKey(next, timeZone);
}

function formatDateTimeRange(startsAt, endsAt, timeZone) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(start);
  const timeLabel =
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
    }).format(end);

  return `${dateLabel}, ${timeLabel}`;
}

const SUPPORT_RESOURCES = [
  {
    id: "tutoring",
    category: "Tutoring",
    title: "Tutoring Services and WCOnline",
    summary:
      "Use Truman's tutoring booking flow for tutoring, the Writing Center, and the Communication Lab.",
    description:
      "Truman points students to WCOnline to book tutoring-related appointments. If you need help first, the CAE tutoring team can guide you.",
    url: "https://excellence.truman.edu/tutoring/book-a-tutor/",
    contactEmail: "trumansuccess@truman.edu",
    office: "Center for Academic Excellence",
    draftTitle: "Tutoring support session",
    draftDurationMinutes: 60,
    keywords: [
      "tutor",
      "tutoring",
      "wconline",
      "writing center",
      "communication lab",
      "study help",
      "math help",
    ],
  },
  {
    id: "advising",
    category: "Advising",
    title: "Center for Academic Excellence Advising",
    summary:
      "The CAE advising team helps with academic planning, course selection, and staying on track.",
    description:
      "Use Truman's advising pages to find advisor scheduling links or contact the CAE advising team directly.",
    url: "https://excellence.truman.edu/about-2/staff/",
    contactEmail: "advise@truman.edu",
    office: "Kirk Building",
    draftTitle: "Advising check-in",
    draftDurationMinutes: 45,
    keywords: [
      "advisor",
      "advising",
      "cae",
      "registration",
      "class schedule",
      "academic plan",
      "major",
      "course planning",
    ],
  },
  {
    id: "mental-health",
    category: "Mental Health",
    title: "Mental Health and Support Resources",
    summary:
      "Truman's mental health resource pages help students find support, wellness resources, and campus contacts.",
    description:
      "The mental health resources page is the best first stop. The Women's Resource Center also lists contact information students can use for support questions.",
    url: "https://wrc.truman.edu/info-and-resources/mental-health/mental-health-resources/",
    contactEmail: "wrc@truman.edu",
    office: "Baldwin Hall 110",
    draftTitle: "Mental health support check-in",
    draftDurationMinutes: 30,
    keywords: [
      "mental health",
      "counseling",
      "stress",
      "anxiety",
      "depression",
      "wellness",
      "therapy",
      "burnout",
      "support",
    ],
  },
];

function scoreResource(resource, question) {
  const text = normalizeText(question);
  let score = 0;

  for (const keyword of resource.keywords ?? []) {
    if (text.includes(keyword)) {
      score += keyword.includes(" ") ? 3 : 2;
    }
  }

  if (text.includes(normalizeText(resource.category))) {
    score += 2;
  }

  if (/\b(book|schedule|appointment|meeting|help)\b/.test(text)) {
    score += 1;
  }

  return score;
}

function buildMailToUrl(resource, suggestedSlot) {
  if (!resource.contactEmail) {
    return "";
  }

  const subject = encodeURIComponent(`${resource.category} support request`);
  const bodyLines = [
    "Hi,",
    "",
    `I would like help with ${resource.category.toLowerCase()}.`,
    suggestedSlot
      ? `A time that fits my week well is ${suggestedSlot.displayTime}.`
      : "",
    "",
    "Thank you.",
  ].filter(Boolean);

  return `mailto:${resource.contactEmail}?subject=${subject}&body=${encodeURIComponent(
    bodyLines.join("\n"),
  )}`;
}

function buildActions(resource, suggestedSlot) {
  const actions = [
    {
      type: "open-url",
      label:
        resource.id === "advising"
          ? "Open advising staff + scheduler links"
          : resource.id === "mental-health"
            ? "Open support page"
            : "Open booking page",
      url: resource.url,
    },
  ];

  if (resource.contactEmail) {
    actions.push({
      type: "email",
      label: `Draft ${resource.category.toLowerCase()} email`,
      url: buildMailToUrl(resource, suggestedSlot),
    });
  }

  return actions;
}

function buildSupportDraft(resource, suggestedSlot) {
  if (!suggestedSlot) {
    return null;
  }

  return {
    summary: resource.draftTitle,
    description: `[Truman Concierge Planner] Reserved before opening the official ${resource.category.toLowerCase()} flow.`,
    location: resource.office || resource.category,
    startDateTime: suggestedSlot.startsAt,
    endDateTime: suggestedSlot.endsAt,
    displayTime: suggestedSlot.displayTime,
  };
}

function buildTextResponse(question, matches, suggestedSlot) {
  if (!matches.length) {
    return "I can help with tutoring, advising, or mental-health support. Tell me what kind of help you need and I'll route you to the right Truman page, suggest a good slot from your calendar, and help you hold that time.";
  }

  const topMatch = matches[0];
  const asksForAppointment = /\b(book|schedule|appointment|meeting)\b/.test(
    normalizeText(question),
  );
  const slotSentence = suggestedSlot
    ? ` A good opening in your calendar is ${suggestedSlot.displayTime}. I can help you save that as a private hold before you open the official Truman page.`
    : " I could not find a strong open slot yet, but I still pulled the best official next step below.";

  if (topMatch.id === "tutoring") {
    return (
      (asksForAppointment
        ? "For tutoring, the safest Truman path is the official WCOnline booking flow."
        : "For tutoring help, Truman routes students through the official tutoring and WCOnline booking page.") +
      slotSentence
    );
  }

  if (topMatch.id === "advising") {
    return (
      (asksForAppointment
        ? "For advising, the best next step is Truman's official advising staff page with scheduling links."
        : "For advising support, I found Truman's official CAE advising page with staff and scheduling links.") +
      slotSentence
    );
  }

  if (topMatch.id === "mental-health") {
    return (
      "For mental-health support, I can route you to Truman's official support page and contact options." +
      slotSentence
    );
  }

  return `${topMatch.title} looks like the best Truman resource for this request.${slotSentence}`;
}

export class StudentSupportService {
  constructor({
    googleCalendarService,
    defaultTimeZone = "America/Chicago",
  } = {}) {
    this.googleCalendarService = googleCalendarService;
    this.defaultTimeZone = defaultTimeZone;
  }

  getResources() {
    return SUPPORT_RESOURCES;
  }

  async #pickSuggestedSlot({
    userId,
    date,
    timeZone,
    durationMinutes,
  }) {
    if (!userId || !this.googleCalendarService) {
      return null;
    }

    const resolvedTimeZone = timeZone || this.defaultTimeZone;

    for (let offset = 0; offset < 7; offset += 1) {
      const targetDate = addDays(date, offset, resolvedTimeZone);
      const schedule = await this.googleCalendarService.getDailySchedule({
        userId,
        date: targetDate,
        timeZone: resolvedTimeZone,
      });

      for (const block of schedule.freeBlocks ?? []) {
        if ((block.durationMinutes ?? 0) < durationMinutes) {
          continue;
        }

        const startsAt = block.startsAt;
        const endsAt = new Date(
          new Date(startsAt).getTime() + durationMinutes * 60_000,
        ).toISOString();

        return {
          date: targetDate,
          startsAt,
          endsAt,
          displayTime: formatDateTimeRange(startsAt, endsAt, resolvedTimeZone),
        };
      }
    }

    return null;
  }

  async respondToQuery(question, { userId, date, timeZone } = {}) {
    const rankedMatches = SUPPORT_RESOURCES.map((resource) => ({
      ...resource,
      score: scoreResource(resource, question),
    }))
      .filter((resource) => resource.score > 0)
      .sort((left, right) => right.score - left.score);

    const matchedResources = rankedMatches.length
      ? rankedMatches.slice(0, 2)
      : SUPPORT_RESOURCES;
    const topMatch = matchedResources[0] ?? null;
    const suggestedSlot = topMatch
      ? await this.#pickSuggestedSlot({
          userId,
          date,
          timeZone,
          durationMinutes: topMatch.draftDurationMinutes,
        })
      : null;
    const enrichedMatches = matchedResources.map((resource, index) => ({
      ...resource,
      actions: buildActions(resource, index === 0 ? suggestedSlot : null),
    }));

    return {
      question,
      matchedResources: enrichedMatches,
      suggestedSlot,
      supportDraft: topMatch ? buildSupportDraft(topMatch, suggestedSlot) : null,
      textResponse: buildTextResponse(question, enrichedMatches, suggestedSlot),
    };
  }
}
