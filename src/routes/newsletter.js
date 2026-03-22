import { Router } from "express";

export function createNewsletterRouter({ newsletterService }) {
  const router = Router();

  router.get("/issue", async (request, response, next) => {
    try {
      const forceRefresh = request.query.refresh === "true";
      const issue = await newsletterService.getIssue({ forceRefresh });
      response.json(issue);
    } catch (error) {
      next(error);
    }
  });

  router.post("/respond", async (request, response, next) => {
    try {
      const { question, forceRefresh = false } = request.body ?? {};

      if (!question) {
        response.status(400).json({ error: "question is required." });
        return;
      }

      const result = await newsletterService.respondToQuery(question, {
        forceRefresh,
      });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
