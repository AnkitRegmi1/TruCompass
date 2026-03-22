import { Router } from "express";

export function createEventsRouter({ trumanEventsService }) {
  const router = Router();
  async function respondWithEvents(request, response, next, loader) {
    try {
      const forceRefresh = request.query.refresh === "true";
      const date = request.query.date;
      const timeZone = request.query.timeZone;
      const payload = date
        ? await loader.forDate({
            date,
            timeZone,
            forceRefresh,
          })
        : await loader.all({
            forceRefresh,
            timeZone,
          });

      response.json(payload);
    } catch (error) {
      next(error);
    }
  }

  router.get("/on-campus", async (request, response, next) => {
    await respondWithEvents(request, response, next, {
      all: (options) => trumanEventsService.getOnCampusEvents(options),
      forDate: (options) => trumanEventsService.getEventsForDate(options),
    });
  });

  router.get("/athletics", async (request, response, next) => {
    await respondWithEvents(request, response, next, {
      all: (options) => trumanEventsService.getAthleticsEvents(options),
      forDate: (options) => trumanEventsService.getAthleticsEventsForDate(options),
    });
  });

  async function respondWithFeeds(request, response, next) {
    try {
      const forceRefresh = request.query.refresh === "true";
      const payload = await trumanEventsService.getFeedsList({
        forceRefresh,
      });

      response.json(payload);
    } catch (error) {
      next(error);
    }
  }

  router.get("/feeds", respondWithFeeds);
  router.get("/feeds-list", respondWithFeeds);

  router.get("/updates", async (request, response, next) => {
    try {
      const forceRefresh = request.query.refresh === "true";
      const date = request.query.date;
      const timeZone = request.query.timeZone;
      const limit = request.query.limit ? Number(request.query.limit) : undefined;
      const payload = await trumanEventsService.getFeedUpdates({
        date,
        timeZone,
        forceRefresh,
        ...(Number.isFinite(limit) ? { limit } : {}),
      });

      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
