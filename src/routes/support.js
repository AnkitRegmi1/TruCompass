import { Router } from "express";

export function createSupportRouter({ studentSupportService }) {
  const router = Router();

  router.get("/resources", (_request, response) => {
    response.json({
      resources: studentSupportService.getResources(),
    });
  });

  router.post("/respond", async (request, response) => {
    const { question, userId, date, timeZone } = request.body ?? {};

    if (!question) {
      response.status(400).json({
        error: "question is required.",
      });
      return;
    }

    response.json(
      await studentSupportService.respondToQuery(question, {
        userId,
        date,
        timeZone,
      }),
    );
  });

  return router;
}
