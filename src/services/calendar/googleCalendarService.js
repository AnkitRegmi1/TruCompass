import { createDisplayBlock } from "../../lib/time/intervals.js";
import {
  getDayRange,
  getLocalDateKey,
  getWakingRange,
  zonedTimeToUtc,
} from "../../lib/time/timeZone.js";

function isLikelyClassEvent(summary) {
  const text = String(summary ?? "");
  return (
    /\b[A-Z]{2,4}\s?-?\s?\d{3,4}\b/.test(text) ||
    /\b(class|lecture|lab|seminar|discussion)\b/i.test(text)
  );
}

function isConciergeManagedEvent(event) {
  const summary = String(event?.summary ?? "");
  const description = String(event?.description ?? "");
  const location = String(event?.location ?? "");
  const combined = `${summary}\n${description}\n${location}`;

  return (
    /\[Truman Concierge Planner\]/i.test(combined) ||
    /Planned from Truman Campus Concierge\./i.test(combined) ||
    /Chosen from your free time so this meal fits around classes and meetings\./i.test(
      combined,
    ) ||
    /Library hours snapshot:/i.test(combined) ||
    /^Lunch at /i.test(summary) ||
    /^Dinner at /i.test(summary) ||
    /^Study block\b/i.test(summary) ||
    /\bsession$/i.test(summary)
  );
}

function addDays(dateKey, days, timeZone) {
  const start = getDayRange(dateKey, timeZone).start;
  return getLocalDateKey(
    new Date(start.getTime() + days * 24 * 60 * 60 * 1000),
    timeZone,
  );
}

function getDayOfWeek(dateKey, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(getDayRange(dateKey, timeZone).start);
}

function buildDateTimeIso(dateKey, timeValue, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);

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

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return new Date(leftStart) < new Date(rightEnd) && new Date(leftEnd) > new Date(rightStart);
}

const SAMPLE_CLASS_TEMPLATES = [
  {
    summary: "CS 180 Lecture",
    location: "Violette Hall 1412",
    description: "Sample Truman class for planner testing.",
    days: ["Mon", "Wed", "Fri"],
    startTime: "09:30",
    endTime: "10:20",
  },
  {
    summary: "MATH 198 Lecture",
    location: "Magruder Hall 2001",
    description: "Sample Truman class for planner testing.",
    days: ["Tue", "Thu"],
    startTime: "11:00",
    endTime: "12:15",
  },
  {
    summary: "ENG 190 Seminar",
    location: "McClain Hall 205",
    description: "Sample Truman class for planner testing.",
    days: ["Mon", "Wed"],
    startTime: "13:30",
    endTime: "14:45",
  },
  {
    summary: "BIO 120 Lab",
    location: "Magruder Hall 1034",
    description: "Sample Truman class for planner testing.",
    days: ["Thu"],
    startTime: "14:00",
    endTime: "16:50",
  },
];

export class GoogleCalendarService {
  constructor({
    authService,
    calendarClient,
    freeTimeService,
    wakeStartHour,
    wakeEndHour,
  }) {
    this.authService = authService;
    this.calendarClient = calendarClient;
    this.freeTimeService = freeTimeService;
    this.wakeStartHour = wakeStartHour;
    this.wakeEndHour = wakeEndHour;
  }

  async getDailySchedule({ userId, date, timeZone }) {
    const dayRange = getDayRange(date, timeZone);
    const wakingRange = getWakingRange(
      date,
      timeZone,
      this.wakeStartHour,
      this.wakeEndHour,
    );

    const accessToken = await this.authService.getValidAccessToken(userId);

    if (!accessToken) {
      return {
        calendarConnected: false,
        busyBlocks: [],
        freeBlocks: [],
        date,
        timeZone,
      };
    }

    const eventsResponse = await this.calendarClient.listEvents({
      accessToken,
      timeMin: dayRange.start.toISOString(),
      timeMax: dayRange.end.toISOString(),
      timeZone,
    });

    const relevantEvents = (eventsResponse.items ?? [])
      .filter(
        (event) =>
          event?.status !== "cancelled" &&
          event?.start?.dateTime &&
          event?.end?.dateTime &&
          !isConciergeManagedEvent(event),
      )
      .sort(
        (left, right) =>
          new Date(left.start.dateTime).getTime() -
          new Date(right.start.dateTime).getTime(),
      );
    const busyRanges = relevantEvents.map((event) => ({
      start: new Date(event.start.dateTime),
      end: new Date(event.end.dateTime),
    }));
    const busyEvents = relevantEvents
      .map((event) =>
        createDisplayBlock(
          new Date(event.start.dateTime),
          new Date(event.end.dateTime),
          timeZone,
          {
            summary: event.summary || "Busy",
            location: event.location || "",
            description: event.description || "",
            isLikelyClass: isLikelyClassEvent(event.summary),
          },
        ),
      );

    return {
      calendarConnected: true,
      date,
      timeZone,
      busyBlocks: busyRanges.map((range) =>
        createDisplayBlock(range.start, range.end, timeZone),
      ),
      freeBlocks: this.freeTimeService.calculateFreeBlocks({
        busyRanges,
        wakingRange,
        timeZone,
      }),
      busyEvents,
    };
  }

  async #findConflictingEvents({
    accessToken,
    startDateTime,
    endDateTime,
    timeZone,
  }) {
    const localDate = getLocalDateKey(new Date(startDateTime), timeZone);
    const dayRange = getDayRange(localDate, timeZone);
    const eventsResponse = await this.calendarClient.listEvents({
      accessToken,
      timeMin: dayRange.start.toISOString(),
      timeMax: dayRange.end.toISOString(),
      timeZone,
    });

    return (eventsResponse.items ?? []).filter(
      (event) =>
        event?.status !== "cancelled" &&
        event?.start?.dateTime &&
        event?.end?.dateTime &&
        rangesOverlap(
          startDateTime,
          endDateTime,
          event.start.dateTime,
          event.end.dateTime,
        ),
    );
  }

  async createEvent({
    userId,
    summary,
    description,
    location,
    startDateTime,
    endDateTime,
    timeZone,
  }) {
    const accessToken = await this.authService.getValidAccessToken(userId);

    if (!accessToken) {
      throw new Error("Google Calendar is not connected for this user.");
    }

    const conflicts = await this.#findConflictingEvents({
      accessToken,
      startDateTime,
      endDateTime,
      timeZone,
    });

    if (conflicts.length) {
      const firstConflict = conflicts[0];
      throw new Error(
        `This time already has ${firstConflict.summary || "another calendar event"} on your Google Calendar.`,
      );
    }

    return this.calendarClient.createEvent({
      accessToken,
      event: {
        summary,
        description,
        location,
        start: {
          dateTime: startDateTime,
          timeZone,
        },
        end: {
          dateTime: endDateTime,
          timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: [
            {
              method: "popup",
              minutes: 10,
            },
            {
              method: "email",
              minutes: 1440,
            },
          ],
        },
      },
    });
  }

  async createEvents({ userId, timeZone, events }) {
    const createdEvents = [];
    const skippedEvents = [];
    const reservedInBatch = [];
    const accessToken = await this.authService.getValidAccessToken(userId);

    if (!accessToken) {
      throw new Error("Google Calendar is not connected for this user.");
    }

    for (const event of events ?? []) {
      const batchConflict = reservedInBatch.find((range) =>
        rangesOverlap(
          event.startDateTime,
          event.endDateTime,
          range.startDateTime,
          range.endDateTime,
        ),
      );

      if (batchConflict) {
        skippedEvents.push({
          ...event,
          reason: `Conflicts with another planner item in this save batch: ${batchConflict.summary}.`,
        });
        continue;
      }

      const remoteConflicts = await this.#findConflictingEvents({
        accessToken,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        timeZone,
      });

      if (remoteConflicts.length) {
        skippedEvents.push({
          ...event,
          reason: `Conflicts with existing Google Calendar event: ${remoteConflicts[0].summary || "Busy"}.`,
        });
        continue;
      }

      createdEvents.push(
        await this.calendarClient.createEvent({
          accessToken,
          event: {
            summary: event.summary,
            description: event.description ?? "",
            location: event.location ?? "",
            start: {
              dateTime: event.startDateTime,
              timeZone,
            },
            end: {
              dateTime: event.endDateTime,
              timeZone,
            },
            reminders: {
              useDefault: false,
              overrides: [
                {
                  method: "popup",
                  minutes: 10,
                },
                {
                  method: "email",
                  minutes: 1440,
                },
              ],
            },
          },
        }),
      );
      reservedInBatch.push({
        summary: event.summary,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
      });
    }

    return {
      createdEvents,
      skippedEvents,
    };
  }

  async createSampleClassWeek({ userId, startDate, timeZone }) {
    const resolvedTimeZone = timeZone || "America/Chicago";
    const createdEvents = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const date = addDays(startDate, offset, resolvedTimeZone);
      const weekday = getDayOfWeek(date, resolvedTimeZone);

      for (const template of SAMPLE_CLASS_TEMPLATES) {
        if (!template.days.includes(weekday)) {
          continue;
        }

        const event = await this.createEvent({
          userId,
          summary: template.summary,
          description: template.description,
          location: template.location,
          startDateTime: buildDateTimeIso(
            date,
            template.startTime,
            resolvedTimeZone,
          ),
          endDateTime: buildDateTimeIso(
            date,
            template.endTime,
            resolvedTimeZone,
          ),
          timeZone: resolvedTimeZone,
        });

        createdEvents.push({
          ...event,
          summary: template.summary,
          location: template.location,
          date,
          displayTime: `${template.startTime} - ${template.endTime}`,
        });
      }
    }

    return createdEvents;
  }
}
