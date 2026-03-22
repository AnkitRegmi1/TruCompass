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

function createDocument({
  id,
  source,
  date,
  title,
  summary,
  location = "",
  url = "",
  metadata = {},
}) {
  return {
    id,
    source,
    date,
    title,
    summary,
    location,
    url,
    metadata,
  };
}

export class CampusKnowledgeService {
  buildWeeklyKnowledge({
    weekSchedule,
    dailyCampus,
    newsletter,
    librarySnapshot,
    academicCalendar,
  }) {
    const documents = [];

    for (const day of weekSchedule) {
      documents.push(
        createDocument({
          id: `schedule-${day.date}`,
          source: "schedule",
          date: day.date,
          title: `Schedule for ${day.date}`,
          summary: day.calendarConnected
            ? `Free blocks: ${day.freeBlocks.map((block) => block.label).join("; ") || "none"}. Busy blocks: ${day.busyBlocks.map((block) => block.label).join("; ") || "none"}.`
            : "Google Calendar is not connected.",
          metadata: {
            freeBlocks: day.freeBlocks,
            busyBlocks: day.busyBlocks,
          },
        }),
      );
    }

    for (const day of dailyCampus) {
      for (const event of day.campusEvents ?? []) {
        documents.push(
          createDocument({
            id: `event-${event.uid}`,
            source: "campus-event",
            date: day.date,
            title: event.summary,
            summary: `${event.displayTime}${event.location ? ` at ${event.location}` : ""}`,
            location: event.location,
            metadata: event,
          }),
        );
      }

      for (const event of day.athleticsEvents ?? []) {
        documents.push(
          createDocument({
            id: `athletics-${event.uid}`,
            source: "athletics-event",
            date: day.date,
            title: event.summary,
            summary: `${event.displayTime}${event.location ? ` at ${event.location}` : ""}`,
            location: event.location,
            url: event.detailsUrl || event.scheduleUrl || "",
            metadata: event,
          }),
        );
      }

      for (const recEvent of day.recData?.events ?? []) {
        documents.push(
          createDocument({
            id: `rec-${day.date}-${recEvent.title}`,
            source: "rec-event",
            date: day.date,
            title: recEvent.title,
            summary: recEvent.details || recEvent.time || "Campus Rec event",
            location: recEvent.location,
            url: recEvent.url,
            metadata: recEvent,
          }),
        );
      }

      for (const update of day.campusUpdates ?? []) {
        documents.push(
          createDocument({
            id: update.id,
            source: "campus-update",
            date: update.localDate || day.date,
            title: update.title,
            summary: update.summary,
            url: update.url,
            metadata: update,
          }),
        );
      }

      for (const [hallKey, hall] of Object.entries(day.dining ?? {})) {
        if (!hall || hallKey === "source" || hallKey === "date" || hallKey === "fetchedAt") {
          continue;
        }

        documents.push(
          createDocument({
            id: `dining-${hallKey}-${day.date}`,
            source: "dining",
            date: day.date,
            title: `${hall.hallName} dining`,
            summary: `Hours: ${hall.hours?.display || "Hours not found"}. Lunch: ${(hall.meals?.lunch ?? []).slice(0, 8).join(", ")}. Dinner: ${(hall.meals?.dinner ?? []).slice(0, 8).join(", ")}.`,
            location: hall.location,
            url: hall.sourceUrl,
            metadata: hall,
          }),
        );
      }
    }

    for (const article of newsletter?.articles ?? []) {
      documents.push(
        createDocument({
          id: `newsletter-${article.url}`,
          source: "newsletter",
          date: "",
          title: article.title,
          summary: `Truman Today article from ${newsletter.title}.`,
          url: article.url,
          metadata: article,
        }),
      );
    }

    if (librarySnapshot?.hours) {
      documents.push(
        createDocument({
          id: "library-hours",
          source: "library",
          date: librarySnapshot.date || "",
          title: "Pickler Memorial Library hours",
          summary: librarySnapshot.hours,
          url: librarySnapshot.url,
          metadata: librarySnapshot,
        }),
      );
    }

    for (const entry of academicCalendar?.entries ?? []) {
      documents.push(
        createDocument({
          id: `academic-${entry.date}-${entry.title}`,
          source: "academic-calendar",
          date: entry.date,
          title: entry.title,
          summary: entry.label,
          url: academicCalendar.url,
          metadata: entry,
        }),
      );
    }

    return documents;
  }

  search(query, documents, limit = 8) {
    return (documents ?? [])
      .map((document) => ({
        ...document,
        score: scoreMatch(
          query,
          `${document.title} ${document.summary} ${document.location || ""} ${document.source}`,
        ),
      }))
      .filter((document) => document.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }
}
