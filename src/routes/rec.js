import { Router } from "express";

export function createRecRouter({ campusRecService }) {
  const router = Router();

  router.get("/data", async (_request, response, next) => {
    try {
      const recData = await campusRecService.getCampusRecData();
      response.json(recData);
    } catch (error) {
      next(error);
    }
  });

  router.post("/respond", async (request, response, next) => {
    try {
      const { question, date, timeZone } = request.body ?? {};

      if (!question) {
        response.status(400).json({ error: "question is required." });
        return;
      }

      const result = await campusRecService.respondToQuery(question, {
        ...(date ? { date } : {}),
        ...(timeZone ? { timeZone } : {}),
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
