import { Router } from "express";

export function createCalendarRouter({
  googleCalendarAuthService,
  googleCalendarService,
  defaultTimeZone,
}) {
  const router = Router();

  router.get("/google/auth-url", async (request, response, next) => {
    try {
      const userId = request.query.userId;
      const shouldRedirect = request.query.redirect === "true";

      if (!userId) {
        response.status(400).json({ error: "userId is required." });
        return;
      }

      const authUrl = await googleCalendarAuthService.createAuthUrl(userId);

      if (shouldRedirect) {
        response.redirect(authUrl);
        return;
      }

      response.json({ userId, authUrl });
    } catch (error) {
      next(error);
    }
  });

  router.get("/google/callback", async (request, response, next) => {
    try {
      const { code, state } = request.query;

      if (!code || !state) {
        response
          .status(400)
          .json({ error: "Both code and state are required." });
        return;
      }

      const result = await googleCalendarAuthService.handleOAuthCallback({
        code,
        state,
      });

      response.redirect(
        `/?calendarConnected=true&userId=${encodeURIComponent(result.userId ?? state)}`,
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/google/busy", async (request, response, next) => {
    try {
      const userId = request.query.userId;
      const date = request.query.date;
      const timeZone = request.query.timeZone ?? defaultTimeZone;

      if (!userId || !date) {
        response.status(400).json({
          error: "userId and date are required.",
        });
        return;
      }

      const schedule = await googleCalendarService.getDailySchedule({
        userId,
        date,
        timeZone,
      });

      response.json(schedule);
    } catch (error) {
      next(error);
    }
  });

  router.post("/google/events", async (request, response, next) => {
    try {
      const {
        userId,
        summary,
        description = "",
        location = "",
        startDateTime,
        endDateTime,
        timeZone = defaultTimeZone,
      } = request.body ?? {};

      if (!userId || !summary || !startDateTime || !endDateTime) {
        response.status(400).json({
          error:
            "userId, summary, startDateTime, and endDateTime are required.",
        });
        return;
      }

      const event = await googleCalendarService.createEvent({
        userId,
        summary,
        description,
        location,
        startDateTime,
        endDateTime,
        timeZone,
      });

      response.json({
        created: true,
        event,
      });
    } catch (error) {
      if (/already has/i.test(error.message)) {
        response.status(409).json({
          error: error.message,
        });
        return;
      }
      next(error);
    }
  });

  router.post("/google/events/batch", async (request, response, next) => {
    try {
      const {
        userId,
        events,
        timeZone = defaultTimeZone,
      } = request.body ?? {};

      if (!userId || !Array.isArray(events) || !events.length) {
        response.status(400).json({
          error: "userId and a non-empty events array are required.",
        });
        return;
      }

      const invalidEvent = events.find(
        (event) => !event?.summary || !event?.startDateTime || !event?.endDateTime,
      );

      if (invalidEvent) {
        response.status(400).json({
          error:
            "Each event in the batch needs summary, startDateTime, and endDateTime.",
        });
        return;
      }

      const { createdEvents, skippedEvents } = await googleCalendarService.createEvents({
        userId,
        timeZone,
        events,
      });

      response.json({
        created: true,
        count: createdEvents.length,
        events: createdEvents,
        skippedCount: skippedEvents.length,
        skippedEvents,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/google/sample-classes", async (request, response, next) => {
    try {
      const {
        userId,
        startDate,
        timeZone = defaultTimeZone,
      } = request.body ?? {};

      if (!userId || !startDate) {
        response.status(400).json({
          error: "userId and startDate are required.",
        });
        return;
      }

      const events = await googleCalendarService.createSampleClassWeek({
        userId,
        startDate,
        timeZone,
      });

      response.json({
        created: true,
        count: events.length,
        events,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
