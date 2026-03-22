import { requestJson } from "../../lib/http/request.js";

const GOOGLE_FREE_BUSY_URL =
  "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleCalendarClient {
  async getBusyTimes({ accessToken, timeMin, timeMax, timeZone }) {
    return requestJson(GOOGLE_FREE_BUSY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      json: {
        timeMin,
        timeMax,
        timeZone,
        items: [{ id: "primary" }],
      },
      timeoutMs: 20_000,
    });
  }

  async createEvent({ accessToken, event }) {
    return requestJson(GOOGLE_EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      json: event,
      timeoutMs: 20_000,
    });
  }

  async listEvents({ accessToken, timeMin, timeMax, timeZone }) {
    const url = new URL(GOOGLE_EVENTS_URL);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeZone", timeZone);
    url.searchParams.set(
      "fields",
      "items(summary,location,description,start,end,status)",
    );

    return requestJson(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeoutMs: 20_000,
    });
  }
}
