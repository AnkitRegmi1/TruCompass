import { Router } from "express";

export function createDiningRouter({ diningService }) {
  const router = Router();

  router.get("/menus", async (request, response, next) => {
    try {
      const date = request.query.date;
      const forceRefresh = request.query.refresh === "true";
      const payload = await diningService.getAllMenus({
        ...(date ? { date } : {}),
        forceRefresh,
      });

      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post("/respond", async (request, response, next) => {
    try {
      const { question, date, timeZone, forceRefresh = false } = request.body ?? {};

      if (!question) {
        response.status(400).json({ error: "question is required." });
        return;
      }

      const result = await diningService.respondToQuery(question, {
        ...(date ? { date } : {}),
        ...(timeZone ? { timeZone } : {}),
        forceRefresh,
      });

      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
