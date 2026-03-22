import { Router } from "express";

export function createPlannerRouter({
  weekPlannerService,
  preferencesService,
  defaultTimeZone,
}) {
  const router = Router();

  router.get("/preferences", async (request, response, next) => {
    try {
      const userId = request.query.userId;

      if (!userId) {
        response.status(400).json({ error: "userId is required." });
        return;
      }

      const preferences = await preferencesService.getPreferences(userId);
      response.json({ userId, preferences });
    } catch (error) {
      next(error);
    }
  });

  router.post("/preferences", async (request, response, next) => {
    try {
      const { userId, preferences } = request.body ?? {};

      if (!userId || !preferences) {
        response.status(400).json({ error: "userId and preferences are required." });
        return;
      }

      const savedPreferences = await preferencesService.mergePreferences(
        userId,
        preferences,
      );
      response.json({
        saved: true,
        userId,
        preferences: savedPreferences,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/week", async (request, response, next) => {
    try {
      const {
        userId,
        date,
        timeZone = defaultTimeZone,
        preferences = {},
        forceRefresh = false,
        question = "Plan my week",
      } = request.body ?? {};

      if (!date) {
        response.status(400).json({ error: "date is required." });
        return;
      }

      const plan = await weekPlannerService.planWeek({
        userId,
        date,
        timeZone,
        preferences,
        forceRefresh,
        question,
      });

      response.json(plan);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
